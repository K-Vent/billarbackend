require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// Configuración forzada y explícita para evitar el error de constructor de la v7
const prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'minimal'
});

async function main() {
    console.log('🌱 Iniciando inyección de datos base...');

    try {
        // 1. Configuración Base (Precio del Billar)
        await prisma.config.upsert({
            where: { clave: 'precio_billar' },
            update: { valor: '10' },
            create: { clave: 'precio_billar', valor: '10' }
        });
        console.log('✅ Precio de hora de billar configurado.');

        // 2. Beneficios VIP
        const beneficiosBase = [
            { nivel: 'Bronce', descripcion: 'Nivel inicial. Acumula sellos por visitas.' },
            { nivel: 'Plata', descripcion: 'Acceso a promociones exclusivas en barra.' },
            { nivel: 'Oro', descripcion: '1 Hora gratis de billar por cada 10 sellos.' }
        ];

        for (const b of beneficiosBase) {
            await prisma.beneficios.create({ data: b });
        }
        console.log('✅ Sistema de Fidelidad (CRM) inicializado.');

        // 3. Usuario Administrador
        const hashPassword = await bcrypt.hash('Kevin923@', 10);
        await prisma.usuarios.upsert({
            where: { username: 'kevinventocilla7@gmail.com' },
            update: { password: hashPassword },
            create: {
                username: 'kevinventocilla7@gmail.com',
                password: hashPassword,
                rol: 'admin',
                estado: 'activo'
            }
        });
        console.log('✅ Cuenta de Gerencia creada.');

        console.log('🚀 ¡Base de datos reconstruida con éxito!');
    } catch (err) {
        console.error('❌ Error en el proceso de inyección:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();