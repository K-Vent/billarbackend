const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getNotificaciones = async (req, res) => {
    try {
        const notificaciones = [];

        // 1. Alertas de Inventario (Bajo Stock <= 5)
        const bajoStock = await prisma.productos.findMany({
            where: {
                stock: { lte: 5 },
                estado: 'activo'
            },
            select: { id: true, nombre: true, stock: true }
        });

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
        const eventosPendientes = await prisma.eventos_privados.findMany({
            where: { estado: 'Pendiente' },
            select: { id: true, cliente_nombre: true, fecha_evento: true, fecha_solicitud: true }
        });

        eventosPendientes.forEach(e => {
            notificaciones.push({
                id: `evento-${e.id}`,
                tipo: 'NUEVO_EVENTO',
                titulo: 'Reserva Pendiente',
                mensaje: `Solicitud de ${e.cliente_nombre} para el ${new Date(e.fecha_evento).toLocaleDateString('es-PE')}`,
                fecha: e.fecha_solicitud || new Date(),
                link: '/admin/eventos'
            });
        });

        // Ordenamos por fecha descendente (más recientes primero)
        notificaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json(notificaciones);
    } catch (error) {
        console.error('[ERROR] Obteniendo notificaciones:', error);
        res.status(500).json({ error: 'Error interno obteniendo notificaciones.' });
    }
};

module.exports = {
    getNotificaciones
};
