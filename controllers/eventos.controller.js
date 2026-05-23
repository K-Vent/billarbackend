const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE EVENTOS PRIVADOS Y RESERVAS
// ==========================================

const obtenerEventos = async (req, res, next) => {
    try {
        const eventos = await prisma.eventos_privados.findMany({
            orderBy: { fecha_evento: 'asc' }
        });
        res.json(eventos);
    } catch (e) { next(e); }
};

const crearEvento = async (req, res, next) => {
    try {
        const { 
            cliente_nombre, cliente_telefono, cliente_email, 
            fecha_evento, hora_inicio, cantidad_personas, 
            tipo_plan, extras_seleccionados, tipo_evento 
        } = req.body;

        await prisma.eventos_privados.create({
            data: {
                cliente_nombre,
                cliente_telefono,
                cliente_email: cliente_email || 'Sin correo',
                // Prisma requiere objetos Date para los campos de fecha/hora
                fecha_evento: new Date(fecha_evento), 
                hora_inicio: new Date(`${fecha_evento}T${hora_inicio}:00.000Z`),
                cantidad_personas: cantidad_personas.toString(),
                tipo_plan,
                extras_seleccionados,
                tipo_evento: tipo_evento || 'No especificado',
                estado: 'Pendiente'
            }
        });

        res.json({ success: true, message: 'Reserva de evento creada exitosamente.' });
    } catch (e) { next(e); }
};

const actualizarEstadoEvento = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const { estado } = req.body; // Ej: "Confirmado", "Cancelado", "Finalizado"

        await prisma.eventos_privados.update({
            where: { id: id },
            data: { estado: estado }
        });

        res.json({ success: true });
    } catch (e) { next(e); }
};

module.exports = { 
    obtenerEventos, 
    crearEvento, 
    actualizarEstadoEvento 
};