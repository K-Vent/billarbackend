const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

/**
 * Instancia del cliente de Prisma para interactuar con la base de datos.
 * @type {PrismaClient}
 */
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE EVENTOS PRIVADOS Y RESERVAS
// ==========================================

/**
 * Obtiene todos los eventos privados registrados, ordenados por fecha de evento de forma ascendente.
 *
 * @async
 * @function obtenerEventos
 * @param {import('express').Request} req - Objeto de petición de Express.
 * @param {import('express').Response} res - Objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - Función para pasar el control al siguiente middleware en caso de error.
 * @returns {Promise<void>} Retorna un JSON con la lista de eventos.
 */
const obtenerEventos = async (req, res, next) => {
    try {
        // Consultar la base de datos para obtener todos los eventos privados
        // Se ordenan por 'fecha_evento' para mostrarlos cronológicamente
        const eventos = await prisma.eventos_privados.findMany({
            orderBy: { fecha_evento: 'asc' }
        });
        
        // Enviar la respuesta con los eventos encontrados
        res.json(eventos);
    } catch (e) { 
        // En caso de error, pasar el error al middleware de manejo de errores
        next(e); 
    }
};

/**
 * Crea un nuevo evento privado o reserva basándose en los datos proporcionados en el cuerpo de la petición.
 *
 * @async
 * @function crearEvento
 * @param {import('express').Request} req - Objeto de petición de Express, que contiene los datos del evento en el body.
 * @param {import('express').Response} res - Objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - Función para pasar el control al siguiente middleware en caso de error.
 * @returns {Promise<void>} Retorna un JSON indicando el éxito de la operación.
 */
const crearEvento = async (req, res, next) => {
    try {
        // Extraer los datos necesarios del cuerpo de la petición (req.body)
        const { 
            cliente_nombre, cliente_telefono, cliente_email, 
            fecha_evento, hora_inicio, cantidad_personas, 
            tipo_plan, extras_seleccionados, tipo_evento 
        } = req.body;

        // Crear un nuevo registro de evento privado en la base de datos
        await prisma.eventos_privados.create({
            data: {
                cliente_nombre,
                cliente_telefono,
                // Asignar 'Sin correo' por defecto si no se proporciona un email
                cliente_email: cliente_email || 'Sin correo',
                
                // Prisma requiere objetos Date para los campos de fecha/hora,
                // por lo tanto se convierten los strings recibidos a objetos Date
                fecha_evento: new Date(fecha_evento), 
                // Se concatena la fecha y la hora para crear la fecha de inicio completa en formato ISO
                hora_inicio: new Date(`${fecha_evento}T${hora_inicio}:00.000Z`),
                
                // Convertir la cantidad de personas a string según lo requiere la base de datos
                cantidad_personas: cantidad_personas.toString(),
                tipo_plan,
                extras_seleccionados,
                // Asignar 'No especificado' por defecto si el tipo de evento no fue proporcionado
                tipo_evento: tipo_evento || 'No especificado',
                // Inicializar el estado del evento como 'Pendiente' de forma predeterminada
                estado: 'Pendiente'
            }
        });

        // Enviar respuesta exitosa indicando que la reserva se creó correctamente
        res.json({ success: true, message: 'Reserva de evento creada exitosamente.' });
    } catch (e) { 
        // Capturar cualquier error y pasarlo al middleware de errores
        next(e); 
    }
};

/**
 * Actualiza el estado de un evento privado específico (por ejemplo: Confirmado, Cancelado, Finalizado).
 *
 * @async
 * @function actualizarEstadoEvento
 * @param {import('express').Request} req - Objeto de petición de Express, que contiene el 'id' en los parámetros de la URL y el nuevo 'estado' en el body.
 * @param {import('express').Response} res - Objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - Función para pasar el control al siguiente middleware en caso de error.
 * @returns {Promise<void>} Retorna un JSON indicando que la actualización fue exitosa.
 */
const actualizarEstadoEvento = async (req, res, next) => {
    try {
        // Obtener el ID del evento de los parámetros de la URL usando Zod para validación
        const id = z.coerce.number().int().parse(req.params.id);
        
        // Extraer el nuevo estado del cuerpo de la petición
        // Ej: "Confirmado", "Cancelado", "Finalizado"
        const { estado } = req.body; 

        // Actualizar el estado del evento correspondiente en la base de datos
        await prisma.eventos_privados.update({
            where: { id: id },
            data: { estado: estado }
        });

        // Enviar respuesta de éxito al cliente
        res.json({ success: true });
    } catch (e) { 
        // Enviar el error al middleware de manejo de excepciones
        next(e); 
    }
};

module.exports = { 
    obtenerEventos, 
    crearEvento, 
    actualizarEstadoEvento 
};