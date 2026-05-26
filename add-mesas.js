require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('[SETUP] Verificando e inyectando mesas base...');

    // Borramos mesas existentes (opcional, pero ayuda a empezar limpio)
    // Cuidado si hay ventas o pedidos anclados. Para evitar problemas de llaves foráneas, 
    // primero comprobamos si la tabla de mesas está vacía.
    
    const count = await prisma.mesas.count();
    if (count > 0) {
        console.log(`[SETUP] Ya existen ${count} mesas en la base de datos.`);
        console.log('[SETUP] Saltando la inyección para evitar duplicados.');
        return;
    }

    // Insertar 4 de Billar
    for (let i = 1; i <= 4; i++) {
        await prisma.mesas.create({
            data: {
                numero_mesa: i,
                tipo: 'BILLAR',
                estado: 'LIBRE',
                precio_hora: 10.00
            }
        });
        console.log(`[SETUP] Creada Mesa de Billar #${i}`);
    }

    // Insertar 5 de Consumo
    for (let i = 5; i <= 9; i++) {
        await prisma.mesas.create({
            data: {
                numero_mesa: i,
                tipo: 'CONSUMO',
                estado: 'LIBRE',
                precio_hora: 0.00
            }
        });
        console.log(`[SETUP] Creada Mesa de Consumo #${i}`);
    }

    console.log('[SETUP] Mesas inicializadas con éxito.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
