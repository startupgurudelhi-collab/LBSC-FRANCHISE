import type { DatabaseAdapter, MigrationDefinition } from '../../types/index.js';
import { INITIAL_ROLES, SYSTEM_PERMISSIONS } from '../../auth/roles.js';

export const migration002AuthRoles: MigrationDefinition = {
  id: '002',
  name: '002_auth_roles',
  up: async (db: DatabaseAdapter) => {
    // 1. Seed Permissions
    const allPermissions = Object.entries(SYSTEM_PERMISSIONS);

    for (const [, permCode] of allPermissions) {
      const category = permCode.split(':')[0];
      const existing = await db.query<any>('SELECT id FROM permissions WHERE code = ?', [permCode]);
      if (existing.length === 0) {
        const id = `perm_${permCode.replace(/:/g, '_')}`;
        await db.execute(
          'INSERT INTO permissions (id, code, category, description) VALUES (?, ?, ?, ?)',
          [id, permCode, category, `Permission to perform ${permCode}`]
        );
      }
    }

    // 2. Seed Roles and Role-Permissions
    for (const roleDef of INITIAL_ROLES) {
      const existingRole = await db.query<any>('SELECT id FROM roles WHERE code = ?', [roleDef.code]);
      let roleId: string;

      if (existingRole.length === 0) {
        roleId = `role_${roleDef.code}`;
        const isSystem = db.getDialect() === 'sqlite' ? 1 : true;
        await db.execute(
          'INSERT INTO roles (id, name, code, description, is_system) VALUES (?, ?, ?, ?, ?)',
          [roleId, roleDef.name, roleDef.code, roleDef.description, isSystem]
        );
      } else {
        roleId = existingRole[0].id;
      }

      // Map permissions to this role
      for (const permCode of roleDef.permissions) {
        const permRecord = await db.query<any>('SELECT id FROM permissions WHERE code = ?', [permCode]);
        if (permRecord.length > 0) {
          const permId = permRecord[0].id;
          const mapped = await db.query<any>(
            'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?',
            [roleId, permId]
          );
          if (mapped.length === 0) {
            await db.execute(
              'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
              [roleId, permId]
            );
          }
        }
      }
    }
  },

  down: async (db: DatabaseAdapter) => {
    await db.execute('DELETE FROM role_permissions');
    await db.execute('DELETE FROM user_roles');
    await db.execute('DELETE FROM permissions');
    await db.execute('DELETE FROM roles');
  },
};
