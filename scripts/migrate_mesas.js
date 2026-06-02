const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando migración...");
    const result = await prisma.mesas.updateMany({
        where: { numero_mesa: { gt: 4 } },
        data: { tipo: 'CONSUMO' }
    });
    console.log(`Mesas actualizadas: ${result.count}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
