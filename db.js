require('dotenv').config(); // Carga las variables secretas del .env
const { Pool } = require('pg');

console.log("==========================================");
console.log("🔍 DIAGNÓSTICO DE BASE DE DATOS:");
console.log("DATABASE_URL detectada:", process.env.DATABASE_URL ? "✅ SÍ (" + process.env.DATABASE_URL.substring(0, 20) + "...)" : "❌ NO (undefined)");
console.log("==========================================");

// Creamos el Pool usando la URL secreta
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
    // 🔥 Hemos ELIMINADO los timeouts para que la nube no corte la llamada por latencia
});

// Forzar Hora Perú (UTC-5)
pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'America/Lima'");
});

// Exportamos el pool para que el resto del sistema lo use
module.exports = pool;