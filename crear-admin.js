/**
 * crear-admin.js
 * Ejecutar con: node crear-admin.js
 * Crea o actualiza el usuario admin para acceso al sistema.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const USERNAME  = 'admin';
    const PASSWORD  = 'admin123';

    console.log('[SETUP] Creando usuario administrador...');

    const hash = await bcrypt.hash(PASSWORD, 10);

    await prisma.usuarios.upsert({
        where: { username: USERNAME },
        update: { password: hash, estado: 'activo', rol: 'admin' },
        create: {
            username: USERNAME,
            password: hash,
            rol: 'admin',
            estado: 'activo'
        }
    });

    console.log('[SETUP] Usuario creado/actualizado:');
    console.log('   Usuario:    admin');
    console.log('   Contraseña: admin123');
    console.log('');
    console.log('[SETUP] Listo. Reinicia el servidor y entra con esas credenciales.');

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('[ERROR]', e.message);
    process.exit(1);
});
