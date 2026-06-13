const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

/**
 * Obtiene todas las reclamaciones (Para el panel de administración)
 */
const getReclamaciones = async (req, res) => {
    try {
        const reclamaciones = await prisma.reclamaciones.findMany({
            orderBy: { fecha_reclamo: 'desc' }
        });
        res.json({ success: true, reclamaciones });
    } catch (error) {
        console.error("Error al obtener reclamaciones:", error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
};

/**
 * Crea una nueva reclamación (Formulario público)
 */
const createReclamacion = async (req, res) => {
    try {
        const data = req.body;

        // Generar número correlativo (ej. 000001-2026)
        // 1. Contar cuántos reclamos van en el año actual
        const year = new Date().getFullYear();
        const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
        
        const count = await prisma.reclamaciones.count({
            where: {
                fecha_reclamo: {
                    gte: startOfYear
                }
            }
        });

        // 2. Formatear el correlativo
        const sequential = String(count + 1).padStart(6, '0');
        const numeroCorrelativo = `${sequential}-${year}`;

        // 3. Crear el registro en la BD
        const nuevaReclamacion = await prisma.reclamaciones.create({
            data: {
                numero_correlativo: numeroCorrelativo,
                cliente_nombre: data.cliente_nombre,
                cliente_documento: data.cliente_documento,
                cliente_telefono: data.cliente_telefono,
                cliente_email: data.cliente_email,
                cliente_direccion: data.cliente_direccion,
                tipo_bien: data.tipo_bien,
                monto_reclamado: data.monto_reclamado ? parseFloat(data.monto_reclamado) : null,
                descripcion_bien: data.descripcion_bien,
                tipo_reclamacion: data.tipo_reclamacion,
                detalle_reclamacion: data.detalle_reclamacion,
                pedido_consumidor: data.pedido_consumidor
            }
        });

        res.json({ 
            success: true, 
            reclamacion: nuevaReclamacion,
            mensaje: `Su reclamo ha sido registrado exitosamente con el código ${numeroCorrelativo}.`
        });

    } catch (error) {
        console.error("Error al crear reclamación:", error);
        res.status(500).json({ success: false, error: 'Error al procesar el reclamo. Intente nuevamente.' });
    }
};

/**
 * Actualiza el estado de una reclamación (Panel Admin)
 */
const updateReclamacion = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, respuesta_admin } = req.body;
        const parsedId = z.coerce.number().int().parse(id);

        const reclamacionActualizada = await prisma.reclamaciones.update({
            where: { id: parsedId },
            data: {
                estado,
                respuesta_admin,
                fecha_respuesta: estado === 'Resuelto' ? new Date() : null
            }
        });

        res.json({ success: true, reclamacion: reclamacionActualizada });
    } catch (error) {
        console.error("Error al actualizar reclamación:", error);
        res.status(500).json({ success: false, error: 'Error al actualizar el reclamo' });
    }
};

module.exports = {
    getReclamaciones,
    createReclamacion,
    updateReclamacion
};
