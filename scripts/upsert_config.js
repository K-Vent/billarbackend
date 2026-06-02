const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.config.upsert({
        where: { clave: 'PRECIO_HORA_BILLAR' },
        update: { valor: '10' },
        create: { clave: 'PRECIO_HORA_BILLAR', valor: '10' }
    });
    console.log('Config upserted');
}

main().catch(console.error).finally(() => prisma.$disconnect());
