const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, inicializarBanco } = require('./database');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'hub-custos-secret-2026'; // Em produção, use variável de ambiente!

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

inicializarBanco();

// ======================= MIDDLEWARE DE AUTENTICAÇÃO =======================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
    req.user = user;
    next();
  });
};

// ======================= ROTAS DE AUTENTICAÇÃO =======================

// Cadastro de usuário
app.post('/api/register', async (req, res) => {
  const { whatsapp, senha, nome } = req.body;

  if (!whatsapp || !senha) {
    return res.status(400).json({ error: 'WhatsApp e senha são obrigatórios' });
  }

  try {
    const hashedSenha = await bcrypt.hash(senha, 10);

    db.run(
      "INSERT INTO users (whatsapp, senha, nome) VALUES (?, ?, ?)",
      [whatsapp.replace(/\D/g, ''), hashedSenha, nome || null],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Este WhatsApp já está cadastrado' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Usuário cadastrado com sucesso!' });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { whatsapp, senha } = req.body;

  db.get("SELECT * FROM users WHERE whatsapp = ?", [whatsapp.replace(/\D/g, '')], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'WhatsApp ou senha inválidos' });
    }

    const match = await bcrypt.compare(senha, user.senha);
    if (!match) {
      return res.status(401).json({ error: 'WhatsApp ou senha inválidos' });
    }

    const token = jwt.sign(
      { userId: user.id, whatsapp: user.whatsapp },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        whatsapp: user.whatsapp,
        nome: user.nome
      }
    });
  });
});

// ======================= ROTAS PROTEGIDAS =======================

// Listar transações do usuário logado
app.get('/api/transacoes', authenticateToken, (req, res) => {
  db.all(`
    SELECT t.*, c.nome as categoria_nome, c.cor 
    FROM transacoes t 
    LEFT JOIN categorias c ON t.categoria_id = c.id 
    WHERE t.user_id = ?
    ORDER BY t.data_vencimento DESC
  `, [req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Criar nova despesa (com parcelas)
app.post('/api/transacoes', authenticateToken, (req, res) => {
  const { descricao, valor, data_vencimento, categoria_id, parcelas_total = 1, observacoes } = req.body;
  const userId = req.user.userId;
  const grupoId = 'GRP_' + Date.now() + '_' + userId;

  const stmt = db.prepare(`
    INSERT INTO transacoes 
    (user_id, descricao, valor, data_vencimento, categoria_id, parcelas_total, parcela_atual, grupo_parcela_id, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 1; i <= parcelas_total; i++) {
    const vencimento = new Date(data_vencimento);
    vencimento.setMonth(vencimento.getMonth() + (i - 1));
    
    stmt.run(
      userId,
      descricao,
      valor,
      vencimento.toISOString().split('T')[0],
      categoria_id,
      parcelas_total,
      i,
      grupoId,
      observacoes || null
    );
  }

  stmt.finalize();
  res.json({ success: true, message: `${parcelas_total} parcela(s) criada(s)` });
});

// Atualizar despesa
app.put('/api/transacoes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { descricao, valor, data_vencimento, categoria_id, parcelas_total, observacoes } = req.body;

  db.run(`
    UPDATE transacoes 
    SET descricao = ?, 
        valor = ?, 
        data_vencimento = ?, 
        categoria_id = ?, 
        parcelas_total = ?,
        observacoes = ?
    WHERE id = ? AND user_id = ?
  `, [descricao, valor, data_vencimento, categoria_id, parcelas_total, observacoes || null, id, req.user.userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: "Despesa não encontrada ou sem permissão" });
      res.json({ success: true });
    });
});

// Marcar como paga
app.put('/api/transacoes/:id/pagar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { data_pagamento } = req.body;

  db.run(
    "UPDATE transacoes SET data_pagamento = ? WHERE id = ? AND user_id = ?",
    [data_pagamento || new Date().toISOString().split('T')[0], id, req.user.userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: "Despesa não encontrada" });
      res.json({ success: true });
    }
  );
});

// Deletar uma única transação ou todo o grupo
app.delete('/api/transacoes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM transacoes WHERE id = ? AND user_id = ?", [id, req.user.userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/transacoes/grupo/:grupoId', authenticateToken, (req, res) => {
  const { grupoId } = req.params;
  db.run("DELETE FROM transacoes WHERE grupo_parcela_id = ? AND user_id = ?", [grupoId, req.user.userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Listar categorias (pública, mas mantida protegida por segurança)
app.get('/api/categorias', authenticateToken, (req, res) => {
  db.all("SELECT * FROM categorias ORDER BY nome", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 HUB Custos rodando em http://localhost:${PORT}`);
  console.log('✅ Sistema com autenticação por WhatsApp ativado');
});