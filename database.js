const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./despesas.db');

function inicializarBanco() {
  db.serialize(() => {
    // Tabela de Usuários
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        whatsapp TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        nome TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ✅ TABELA DE CATEGORIAS (estava faltando!)
    db.run(`
      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT DEFAULT 'despesa',
        cor TEXT DEFAULT '#6b7280',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de Transações
    db.run(`
      CREATE TABLE IF NOT EXISTS transacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        valor REAL NOT NULL,
        data_vencimento DATE NOT NULL,
        data_pagamento DATE,
        categoria_id INTEGER,
        parcelas_total INTEGER DEFAULT 1,
        parcela_atual INTEGER DEFAULT 1,
        grupo_parcela_id TEXT,
        observacoes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Categorias padrão
    const categoriasPadrao = [
      ['Empréstimos', 'despesa', '#ef4444'],
      ['Educação', 'despesa', '#3b82f6'],
      ['Saúde', 'despesa', '#10b981'],
      ['Compras', 'despesa', '#f59e0b'],
      ['Moradia / Custos Fixos', 'despesa', '#8b5cf6'],
      ['Outros', 'despesa', '#6b7280']
    ];

    const stmt = db.prepare("INSERT OR IGNORE INTO categorias (nome, tipo, cor) VALUES (?, ?, ?)");
    categoriasPadrao.forEach(cat => stmt.run(cat));
    stmt.finalize();

    console.log('✅ Banco inicializado com autenticação de usuários!');
  });
}

module.exports = { db, inicializarBanco };