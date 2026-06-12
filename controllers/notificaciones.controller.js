/**
 * @fileoverview Controlador para la gestión de notificaciones del sistema.
 * Contiene la lógica para generar alertas sobre el inventario y reservas de eventos pendientes.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Obtiene y consolida todas las notificaciones del sistema.
 * Recopila alertas de bajo stock (productos con 5 o menos unidades) y solicitudes 
 * de eventos privados que se encuentren en estado pendiente.
 * 
 * @async
 * @function getNotificaciones
 * @param {import('express').Request} req - Objeto de solicitud HTTP de Express.
 * @param {import('express').Response} res - Objeto de respuesta HTTP de Express.
 * @returns {Promise<void>} Resuelve enviando una respuesta JSON con el arreglo de notificaciones ordenado.
 */
const getNotificaciones = async (req, res) => {
    try {
        // Arreglo para acumular y unificar todas las notificaciones de diferentes orígenes
        const notificaciones = [];

        // 1. Alertas de Inventario (Bajo Stock <= 5)
        // Consultar la base de datos para buscar productos activos cuyo stock haya alcanzado el nivel de alerta
        const bajoStock = await prisma.productos.findMany({
            where: {
                stock: { lte: 5 },
                estado: 'activo'
            },
            select: { id: true, nombre: true, stock: true }
        });

        // Formatear cada producto con bajo stock como un objeto de notificación
        bajoStock.forEach(p => {
            notificaciones.push({
                id: `stock-${p.id}`,
                tipo: 'ALERTA_STOCK',
                titulo: 'Bajo Stock',
                mensaje: `Quedan solo ${p.stock} unid. de ${p.nombre}`,
                fecha: new Date(), // Usamos la fecha actual como timestamp de alerta
                link: '/admin/inventario'
            });
        });

        // 2. Alertas de Eventos Pendientes
        // Recuperar aquellos eventos que están a la espera de ser confirmados o rechazados
        const eventosPendientes = await prisma.eventos_privados.findMany({
            where: { estado: 'Pendiente' },
            select: { id: true, cliente_nombre: true, fecha_evento: true, fecha_solicitud: true }
        });

        // Convertir cada evento pendiente en un objeto estructurado de notificación
        eventosPendientes.forEach(e => {
            notificaciones.push({
                id: `evento-${e.id}`,
                tipo: 'NUEVO_EVENTO',
                titulo: 'Reserva Pendiente',
                mensaje: `Solicitud de ${e.cliente_nombre} para el ${new Date(e.fecha_evento).toLocaleDateString('es-PE')}`,
                fecha: e.fecha_solicitud || new Date(), // Usar fecha original si existe, sino asignar fecha actual como fallback
                link: '/admin/eventos'
            });
        });

        // Ordenamos las notificaciones combinadas por fecha descendente (más recientes primero)
        // para asegurar que el usuario vea primero lo último en ocurrir
        notificaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // Enviar el conjunto final de notificaciones
        res.json(notificaciones);
    } catch (error) {
        // Capturar y registrar el error en consola para diagnóstico en el servidor
        console.error('[ERROR] Obteniendo notificaciones:', error);
        res.status(500).json({ error: 'Error interno obteniendo notificaciones.' });
    }
};

module.exports = {
    getNotificaciones
};
