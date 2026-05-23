const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE ANALYTICS, CAJA Y GESTIÓN DE CIERRES
// ==========================================

/**
 * Procesa y extrae las métricas del Dashboard (BI de la empresa).
 * Estructura los datos limpios listos para ser consumidos por Chart.js.
 * @param {Object} req - Objeto de petición HTTP (incluye query params de fechas)
 * @param {Object} res - Objeto de respuesta HTTP
 */
const getDashboardStats = async (req, res) => {
    try {
        const { inicio, fin } = req.query;
        
        // Filtro dinámico estructurado con operadores de Prisma
        const filterClause = {};
        if (inicio && fin) {
            filterClause.fecha = {
                gte: new Date(inicio),
                lte: new Date(`${fin}T23:59:59.999Z`) // Cerramos el rango del día completo
            };
        }

        // 1. RENDIMIENTO POR MESA
        const agrupacionVentasMesas = await prisma.ventas.groupBy({
            by: ['mesa_id'],
            _sum: {
                total_final: true
            },
            where: filterClause
        });

        const catalogoMesas = await prisma.mesas.findMany({
            select: { id: true, numero_mesa: true }
        });

        const estadisticasMesas = catalogoMesas.map(m => {
            const matchingVenta = agrupacionVentasMesas.find(v => v.mesa_id === m.id);
            return {
                numero_mesa: m.numero_mesa,
                recaudacion: matchingVenta && matchingVenta._sum.total_final 
                    ? Number(matchingVenta._sum.total_final) 
                    : 0
            };
        }).sort((a, b) => b.recaudacion - a.recaudacion);

        // 2. TOP PRODUCTOS
        const agrupacionProductos = await prisma.pedidos_mesa.groupBy({
            by: ['producto_id'],
            _sum: {
                cantidad: true
            },
            where: {
                pagado: true
            },
            orderBy: {
                _sum: {
                    cantidad: 'desc'
                }
            },
            take: 5
        });

        const itemIds = agrupacionProductos.map(ap => ap.producto_id).filter(id => id !== null);
        const catalogoProductos = await prisma.productos.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, nombre: true }
        });

        const estadisticasProductos = agrupacionProductos.map(ap => {
            const matchProd = catalogoProductos.find(p => p.id === ap.producto_id);
            return {
                nombre: matchProd ? matchProd.nombre : 'Desconocido',
                total_vendido: ap._sum.cantidad || 0
            };
        });

        // 3. FLUJO DE CAJA
        const agrupacionMetodos = await prisma.ventas.groupBy({
            by: ['metodo_pago'],
            _sum: {
                total_final: true
            },
            where: filterClause
        });

        const estadisticasMetodos = agrupacionMetodos.map(am => ({
            metodo_pago: am.metodo_pago || 'EFECTIVO',
            monto: am._sum.total_final ? Number(am._sum.total_final) : 0
        }));

        res.json({
            mesas: estadisticasMesas,
            productos: estadisticasProductos,
            metodos: estadisticasMetodos
        });

    } catch (error) {
        console.error("⚠️ [ANALYTICS ENGINE ERROR]:", error);
        res.status(500).json({ error: "Fallo en el procesamiento de BI de la plataforma." });
    }
};

/**
 * Recupera la bitácora histórica de cierres de caja efectuados.
 * Controla la mutación de tipos complejos (BigInt y Decimal).
 * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 */
const getHistorialCierres = async (req, res) => {
    try {
        const historialRaw = await prisma.cierres.findMany({
            orderBy: {
                fecha_cierre: 'desc'
            },
            take: 50
        });

        // Mitigamos el error de JSON stringify mapeando los BigInt y Decimal
        const historialFormateado = historialRaw.map(cierre => ({
            ...cierre,
            id: closureIdToString(cierre.id), 
            total_ventas: closureDecimalToNumber(cierre.total_ventas),
            total_gastos: closureDecimalToNumber(cierre.total_gastos)
        }));

        res.json(historialFormateado);
    } catch (error) {
        console.error("⚠️ Error leyendo historial de cierres:", error);
        res.json([]); 
    }
};

/**
 * Ejecuta la revocación de un cierre de caja específico.
 * Registra la acción en la tabla de auditoría.
 * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 */
const eliminarCierre = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Convertimos a BigInt explícitamente
        const idBigInt = BigInt(id);

        await prisma.cierres.delete({
            where: { id: idBigInt }
        });
        
        // ESPÍA AUDITORÍA
        try {
            await prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'ANULACIÓN',
                    detalles: `Anuló el cierre de caja de la base de datos centralizado ID: ${id}`
                }
            });
        } catch (eEspia) {
            console.error("Aviso Espía (Auditoría fallida):", eEspia.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("⚠️ Error al eliminar cierre:", error);
        res.status(500).json({ error: "Error en el servidor al intentar anular el cierre contable." });
    }
};

// ==========================================
// MÉTODOS DE PARSEO INTRÍNSECOS
// ==========================================
function closureIdToString(bigintValue) {
    return bigintValue !== undefined && bigintValue !== null ? bigintValue.toString() : null;
}

function closureDecimalToNumber(decimalValue) {
    return decimalValue !== undefined && decimalValue !== null ? Number(decimalValue) : 0;
}

module.exports = { 
    getDashboardStats, 
    getHistorialCierres, 
    eliminarCierre 
};