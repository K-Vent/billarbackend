const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE AUDITORÍA (MÓDULO DE SEGURIDAD)
// ==========================================

/**
 * Obtiene los registros de auditoría del sistema de manera optimizada.
 * 
 * Este controlador implementa un límite de 200 registros y realiza
 * el cruce de información con la tabla de usuarios en memoria para 
 * prevenir el problema de consultas N+1, mejorando el rendimiento.
 *
 * @async
 * @function obtenerRegistrosAuditoria
 * @param {import('express').Request} req - Objeto de petición HTTP de Express.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @param {import('express').NextFunction} next - Middleware de manejo de errores de Express.
 * @returns {Promise<void>} Promesa que resuelve enviando la respuesta en formato JSON al cliente.
 */
const obtenerRegistrosAuditoria = async (req, res, next) => {
    try {
        // 1. Obtener los últimos 200 registros ordenados por fecha descendente.
        const auditorias = await prisma.auditoria.findMany({
            orderBy: { fecha: 'desc' },
            take: 200
        });

        // 2. Extraer identificadores de usuarios únicos.
        // Se utiliza un Set para eliminar duplicados y evitar realizar un JOIN 
        // pesado a nivel de base de datos, optimizando así la consulta cruzada.
        const usuarioIds = [...new Set(
            auditorias
                .map(a => a.usuario_id)
                .filter(id => id !== null)
        )];

        // 3. Obtener exclusivamente la información de los usuarios involucrados en los eventos.
        let usuarios = [];
        if (usuarioIds.length > 0) {
            usuarios = await prisma.usuarios.findMany({
                where: { 
                    id: { in: usuarioIds } 
                },
                select: {
                    id: true,
                    username: true // Se selecciona únicamente el campo 'username' para reducir la carga de datos.
                }
            });
        }

        // 4. Mapear y formatear la respuesta final combinando ambas fuentes de datos.
        // Se emula la funcionalidad de la función COALESCE de SQL para manejar valores nulos.
        const registrosFormateados = auditorias.map(auditoria => {
            // Se busca el usuario correspondiente dentro del arreglo alojado en memoria.
            const usuarioAsignado = usuarios.find(u => u.id === auditoria.usuario_id);
            
            return {
                id: auditoria.id,
                fecha: auditoria.fecha,
                accion: auditoria.accion,
                detalles: auditoria.detalles,
                // Aplicación de la lógica de fallback: si el usuario no es encontrado o es nulo,
                // se asigna un valor predeterminado ('Admin/Desconocido').
                usuario: usuarioAsignado ? usuarioAsignado.username : 'Admin/Desconocido'
            };
        });

        // 5. Enviar la respuesta procesada y estandarizada al cliente.
        res.json(registrosFormateados);

    } catch (error) {
        // Registro del error en los logs del servidor para facilitar el monitoreo interno.
        console.error("[CRITICO] Error en módulo de auditoría:", error);
        
        // Se devuelve una respuesta genérica al cliente por motivos de seguridad,
        // evitando exponer información sensible o el stacktrace del error.
        res.status(500).json({ 
            error: 'Error interno al obtener los registros de auditoría de la plataforma.' 
        });
    }
};

module.exports = {
    obtenerRegistrosAuditoria
};