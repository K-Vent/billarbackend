const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE AUDITORÍA (MÓDULO DE SEGURIDAD)
// ==========================================

/**
 * Obtiene los registros de auditoría del sistema.
 * Implementa un límite de 200 registros y cruza la información
 * con la tabla de usuarios en memoria para evitar cuellos de botella (N+1).
 * * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const obtenerRegistrosAuditoria = async (req, res, next) => {
    try {
        // 1. Obtener los últimos 200 registros ordenados por fecha
        const auditorias = await prisma.auditoria.findMany({
            orderBy: { fecha: 'desc' },
            take: 200
        });

        // 2. Extraer IDs de usuarios únicos para optimizar la consulta cruzada
        // Esto evita hacer un JOIN pesado si hay miles de registros
        const usuarioIds = [...new Set(
            auditorias
                .map(a => a.usuario_id)
                .filter(id => id !== null)
        )];

        // 3. Obtener solo los usuarios que participaron en estos 200 eventos
        let usuarios = [];
        if (usuarioIds.length > 0) {
            usuarios = await prisma.usuarios.findMany({
                where: { 
                    id: { in: usuarioIds } 
                },
                select: {
                    id: true,
                    username: true // Solo traemos lo estrictamente necesario
                }
            });
        }

        // 4. Mapear y formatear la respuesta final (equivalente al COALESCE de SQL)
        const registrosFormateados = auditorias.map(auditoria => {
            // Buscamos el usuario correspondiente en nuestro array en memoria
            const usuarioAsignado = usuarios.find(u => u.id === auditoria.usuario_id);
            
            return {
                id: auditoria.id,
                fecha: auditoria.fecha,
                accion: auditoria.accion,
                detalles: auditoria.detalles,
                // Aplicamos la lógica de fallback si el usuario no existe o es nulo
                usuario: usuarioAsignado ? usuarioAsignado.username : 'Admin/Desconocido'
            };
        });

        // 5. Enviar respuesta estandarizada al cliente
        res.json(registrosFormateados);

    } catch (error) {
        // Registro de error en servidor para monitoreo interno
        console.error("[CRITICO] Error en módulo de auditoría:", error);
        
        // Respuesta genérica al cliente por seguridad (no exponer stacktrace)
        res.status(500).json({ 
            error: 'Error interno al obtener los registros de auditoría de la plataforma.' 
        });
    }
};

module.exports = {
    obtenerRegistrosAuditoria
};