import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';

export const migration012Knowledgebase: MigrationDefinition = {
  id: '012',
  name: '012_knowledgebase',
  up: async (db: DatabaseAdapter) => {
    const isSqlite = db.getDialect() === 'sqlite';

    // 1. Knowledgebase Categories table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS kb_categories (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT DEFAULT NULL,
        icon VARCHAR(64) DEFAULT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active ${isSqlite ? 'INTEGER NOT NULL DEFAULT 1' : 'BOOLEAN NOT NULL DEFAULT TRUE'},
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'}
      );
    `);

    // 2. Knowledgebase Articles table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS kb_articles (
        id VARCHAR(64) PRIMARY KEY,
        category_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        author_user_id VARCHAR(64) NOT NULL,
        published_at ${isSqlite ? 'DATETIME DEFAULT NULL' : 'TIMESTAMP WITH TIME ZONE DEFAULT NULL'},
        tags ${isSqlite ? 'TEXT DEFAULT NULL' : 'JSONB DEFAULT NULL'},
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${isSqlite ? "DATETIME DEFAULT (datetime('now'))" : 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP'},
        FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE RESTRICT,
        FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 3. Lookup & Performance Indices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_kb_articles_cat ON kb_articles(category_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(slug);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_kb_articles_created ON kb_articles(created_at);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_kb_categories_slug ON kb_categories(slug);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_kb_categories_order ON kb_categories(display_order);`);

    // 4. Seed Standard Core Categories (Structure taxonomy only - zero mock articles)
    const initialCategories = [
      {
        id: 'cat_compliance',
        name: 'Compliance & Regulatory',
        slug: 'compliance-regulatory',
        description: 'Statutory compliance checklists, legal mandates, and MCA/ROC filing guidelines',
        icon: 'ShieldCheck',
        display_order: 1,
      },
      {
        id: 'cat_taxation_gst',
        name: 'Taxation & GST',
        slug: 'taxation-gst',
        description: 'GST registrations, return filings, TDS provisions, and tax dispute procedures',
        icon: 'Receipt',
        display_order: 2,
      },
      {
        id: 'cat_company_inc',
        name: 'Company Incorporation',
        slug: 'company-incorporation',
        description: 'Private limited, LLP, OPC incorporation step-by-step standard procedures',
        icon: 'Building2',
        display_order: 3,
      },
      {
        id: 'cat_sops',
        name: 'Standard Operating Procedures',
        slug: 'standard-operating-procedures',
        description: 'Client onboarding workflows, document collection protocols, and SLA rules',
        icon: 'FileText',
        display_order: 4,
      },
      {
        id: 'cat_portal_ops',
        name: 'Platform Operations',
        slug: 'platform-operations',
        description: 'LBSC portal usage, commission withdrawals, and lead handling best practices',
        icon: 'HelpCircle',
        display_order: 5,
      },
    ];

    for (const cat of initialCategories) {
      const existing = await db.query<any>('SELECT id FROM kb_categories WHERE id = ? OR slug = ?', [cat.id, cat.slug]);
      if (existing.length === 0) {
        await db.execute(
          `INSERT INTO kb_categories (id, name, slug, description, icon, display_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ${isSqlite ? 1 : 'TRUE'})`,
          [cat.id, cat.name, cat.slug, cat.description, cat.icon, cat.display_order]
        );
      }
    }
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute(`DROP TABLE IF EXISTS kb_articles;`);
    await db.execute(`DROP TABLE IF EXISTS kb_categories;`);
  },
};
