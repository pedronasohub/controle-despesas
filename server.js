const express = require('express');
const cors = require('cors');
const { db, inicializarBanco } = require('./database');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

inicializarBanco();

// ======================= ROTAS =======================

// Listar todas as transações
app.get('/api/transacoes', (req, res) => {
  db.all(`
    SELECT t.*, c.nome as categoria_nome, c.cor 
    FROM transacoes t 
    LEFT JOIN categorias c ON t.categoria_id = c.id 
    ORDER BY t.data_vencimento DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Listar categorias
app.get('/api/categorias', (req, res) => {
  db.all("SELECT * FROM categorias ORDER BY nome", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Adicionar transação
app.post('/api/transacoes', (req, res) => {
  const { descricao, valor, data_vencimento, categoria_id, parcelas_total = 1, observacoes } = req.body;

  const grupoId = 'GRP_' + Date.now();

  const stmt = db.prepare(`
    INSERT INTO transacoes 
    (descricao, valor, data_vencimento, categoria_id, parcelas_total, parcela_atual, grupo_parcela_id, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 1; i <= parcelas_total; i++) {
    const vencimento = new Date(data_vencimento);
    vencimento.setMonth(vencimento.getMonth() + (i - 1));

    stmt.run(
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
  res.json({ success: true, message: `${parcelas_total} parcela(s) adicionada(s)` });
});

// Marcar como paga
app.put('/api/transacoes/:id/pagar', (req, res) => {
  const { data_pagamento } = req.body;
  db.run("UPDATE transacoes SET data_pagamento = ? WHERE id = ?", 
    [data_pagamento || new Date().toISOString().split('T')[0], req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// Deletar transação
app.delete('/api/transacoes/:id', (req, res) => {
  db.run("DELETE FROM transacoes WHERE id = ?", req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


// ==================== ATUALIZAR DESPESA (PUT) ====================
app.put('/api/transacoes/:id', (req, res) => {
  const { id } = req.params;
  const { descricao, valor, data_vencimento, categoria_id, parcelas_total, observacoes } = req.body;

  db.run(`
    UPDATE transacoes 
    SET descricao = ?, 
        valor = ?, 
        data_vencimento = ?, 
        categoria_id = ?, 
        parcelas_total = ?, 
        parcela_atual = 1,   -- resetamos para 1ª parcela ao editar
        observacoes = ?
    WHERE id = ?
  `, [descricao, valor, data_vencimento, categoria_id, parcelas_total, observacoes || null, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Despesa não encontrada" });
    }
    res.json({ success: true, message: "Despesa atualizada com sucesso" });
  });
});



app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});