require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('./lib/prisma'); // ← solo esta línea, elimina el PrismaClient

async function main() {
    console.log('🌱 Iniciando inyección de datos base...');

    try {
        await prisma.config.upsert({
            where: { clave: 'precio_billar' },
            update: { valor: '10' },
            create: { clave: 'precio_billar', valor: '10' }
        });
        console.log('✅ Precio de hora de billar configurado.');

        const beneficiosBase = [
            { nivel: 'Bronce', descripcion: 'Nivel inicial. Acumula sellos por visitas.' },
            { nivel: 'Plata', descripcion: 'Acceso a promociones exclusivas en barra.' },
            { nivel: 'Oro', descripcion: '1 Hora gratis de billar por cada 10 sellos.' }
        ];

        for (const b of beneficiosBase) {
            await prisma.beneficios.create({ data: b });
        }
        console.log('✅ Sistema de Fidelidad (CRM) inicializado.');

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