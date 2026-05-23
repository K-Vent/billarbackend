const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// SERVICIO CENTRAL DE AUDITORÍA (AOP)
// ==========================================

/**
 * Registra acciones críticas en la bitácora del sistema sin detener 
 * el flujo principal del servidor (Fire and Forget).
 * * @param {Object} req - Petición HTTP (para extraer la sesión del usuario)
 * @param {String} accion - Categoría del evento (ej. 'NUEVO PEDIDO', 'CIERRE DE CAJA')
 * @param {String} detalles - Descripción detallada de la operación
 */
const registrarAuditoria = async (req, accion, detalles) => {
    try {
        // Uso de Optional Chaining (?.) para evitar colapsos si req o req.usuario son indefinidos
        const usuario_id = req?.usuario?.id || null;
        
        // Prisma maneja la inserción e ignora la columna 'fecha' para que 
        // PostgreSQL asigne el @default(now()) automáticamente.
        await prisma.auditoria.create({
            data: {
                usuario_id: usuario_id,
                accion: accion,
                detalles: detalles
            }
        });
    } catch (error) {
        // Falla en silencio para no arruinar la venta o el cierre contable
        console.error(`⚠️ [Auditoría Falló] Acción: ${accion} - Error:`, error.message);
    }
};

module.exports = { 
    registrarAuditoria 
};