const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE ANALYTICS, CAJA Y GESTIÓN DE CIERRES
// ==========================================

/**
 * Procesa y extrae las métricas del Dashboard (Inteligencia de Negocios de la empresa).
 * Estructura los datos limpios listos para ser consumidos por Chart.js.
 * 
 * @async
 * @function getDashboardStats
 * @param {import('express').Request} req - Objeto de petición HTTP (incluye los parámetros de consulta `inicio` y `fin`).
 * @param {import('express').Response} res - Objeto de respuesta HTTP para enviar los resultados.
 * @returns {Promise<void>} Promesa que resuelve la petición enviando un JSON con las estadísticas.
 */
const getDashboardStats = async (req, res) => {
    try {
        const { inicio, fin } = req.query;
        
        // Construimos un filtro dinámico utilizando los operadores de Prisma.
        // Esto permite acotar las consultas por rango de fechas si se proveen.
        const filterClause = {};
        if (inicio && fin) {
            filterClause.fecha = {
                gte: new Date(inicio),
                // Aseguramos incluir todo el último día agregando el tiempo hasta el final del mismo
                lte: new Date(`${fin}T23:59:59.999Z`) 
            };
        }

        // 1. RENDIMIENTO POR MESA
        // Agrupamos las ventas por 'mesa_id' para obtener la suma de lo recaudado en cada mesa.
        const agrupacionVentasMesas = await prisma.ventas.groupBy({
            by: ['mesa_id'],
            _sum: {
                total_final: true
            },
            where: filterClause
        });

        // Consultamos el catálogo completo de mesas para tener la referencia del número de cada una.
        const catalogoMesas = await prisma.mesas.findMany({
            select: { id: true, numero_mesa: true }
        });

        // Cruzamos los datos de recaudación con el catálogo de mesas y ordenamos de mayor a menor recaudación.
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
        // Agrupamos los pedidos que ya fueron pagados para encontrar los productos más vendidos.
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
            take: 5 // Solo nos interesan los 5 productos principales
        });

        // Extraemos los IDs de los productos agrupados para buscar sus nombres en el catálogo.
        const itemIds = agrupacionProductos.map(ap => ap.producto_id).filter(id => id !== null);
        const catalogoProductos = await prisma.productos.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, nombre: true }
        });

        // Mapeamos los IDs de los productos con sus respectivos nombres y la cantidad total vendida.
        const estadisticasProductos = agrupacionProductos.map(ap => {
            const matchProd = catalogoProductos.find(p => p.id === ap.producto_id);
            return {
                nombre: matchProd ? matchProd.nombre : 'Desconocido',
                total_vendido: ap._sum.cantidad || 0
            };
        });

        // 3. FLUJO DE CAJA
        // Agrupamos el ingreso final obtenido de acuerdo con el método de pago utilizado.
        const agrupacionMetodos = await prisma.ventas.groupBy({
            by: ['metodo_pago'],
            _sum: {
                total_final: true
            },
            where: filterClause
        });

        // Formateamos las métricas de pago, asumiendo 'EFECTIVO' por defecto si el campo está vacío.
        const estadisticasMetodos = agrupacionMetodos.map(am => ({
            metodo_pago: am.metodo_pago || 'EFECTIVO',
            monto: am._sum.total_final ? Number(am._sum.total_final) : 0
        }));

        // Retornamos el conjunto global de estadísticas para el Dashboard.
        res.json({
            mesas: estadisticasMesas,
            productos: estadisticasProductos,
            metodos: estadisticasMetodos
        });

    } catch (error) {
        console.error("[ANALYTICS] Error en el motor de BI:", error);
        res.status(500).json({ error: "Fallo en el procesamiento de BI de la plataforma." });
    }
};

/**
 * Recupera la bitácora histórica de cierres de caja efectuados.
 * Controla la mutación de tipos complejos (BigInt y Decimal) devueltos por Prisma,
 * preparándolos adecuadamente para su serialización en JSON.
 * 
 * @async
 * @function getHistorialCierres
 * @param {import('express').Request} req - Objeto de petición HTTP.
 * @param {import('express').Response} res - Objeto de respuesta HTTP para enviar los cierres.
 * @returns {Promise<void>} Promesa que resuelve devolviendo el arreglo de cierres formateado.
 */
const getHistorialCierres = async (req, res) => {
    try {
        // Obtenemos los últimos 50 cierres ordenados desde el más reciente al más antiguo.
        const historialRaw = await prisma.cierres.findMany({
            orderBy: {
                fecha_cierre: 'desc'
            },
            take: 50
        });

        // Mitigamos el error de "JSON stringify" que ocurre al intentar convertir datos BigInt
        // o estructuras Decimal propias del ORM, mapeándolos a cadenas y números nativos.
        const historialFormateado = historialRaw.map(cierre => ({
            ...cierre,
            id: closureIdToString(cierre.id), 
            total_ventas: closureDecimalToNumber(cierre.total_ventas),
            total_gastos: closureDecimalToNumber(cierre.total_gastos)
        }));

        res.json(historialFormateado);
    } catch (error) {
        console.error("[ERROR] Lectura de historial de cierres:", error);
        res.json([]); // En caso de error, retornamos un arreglo vacío para no romper la interfaz
    }
};

/**
 * Ejecuta la revocación de un cierre de caja específico.
 * Borra el registro de cierre y posteriormente registra la acción en la tabla de auditoría.
 * 
 * @async
 * @function eliminarCierre
 * @param {import('express').Request} req - Objeto de petición HTTP. Debe contener `req.params.id` y `req.usuario.id`.
 * @param {import('express').Response} res - Objeto de respuesta HTTP para confirmar la operación.
 * @returns {Promise<void>} Promesa que resuelve indicando el éxito o falla de la anulación.
 */
const eliminarCierre = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Convertimos a BigInt explícitamente dado que el ID de cierres es de este tipo en la base de datos.
        const idBigInt = BigInt(id);

        // Efectuamos el borrado del cierre seleccionado
        await prisma.cierres.delete({
            where: { id: idBigInt }
        });
        
        // ESPÍA AUDITORÍA
        // Registramos silenciosamente quién ejecutó la revocación para control interno.
        try {
            await prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'ANULACIÓN',
                    detalles: `Anuló el cierre de caja de la base de datos centralizado ID: ${id}`
                }
            });
        } catch (eEspia) {
            // Si la auditoría falla, capturamos el error pero no bloqueamos la respuesta exitosa al usuario.
            console.error("Aviso Espía (Auditoría fallida):", eEspia.message);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("[ERROR] Error al eliminar cierre:", error);
        res.status(500).json({ error: "Error en el servidor al intentar anular el cierre contable." });
    }
};

// ==========================================
// MÉTODOS DE PARSEO INTRÍNSECOS
// ==========================================

/**
 * Convierte un valor BigInt a cadena de texto de manera segura.
 * Necesario para evitar errores de serialización al enviar JSON al cliente.
 * 
 * @function closureIdToString
 * @param {bigint|null|undefined} bigintValue - El valor de tipo BigInt que se desea transformar.
 * @returns {string|null} Representación en cadena del valor BigInt, o `null` si la entrada es inválida.
 */
function closureIdToString(bigintValue) {
    return bigintValue !== undefined && bigintValue !== null ? bigintValue.toString() : null;
}

/**
 * Convierte un valor Decimal de Prisma (o base de datos) a un número nativo de JavaScript de forma segura.
 * 
 * @function closureDecimalToNumber
 * @param {Object|number|string|null|undefined} decimalValue - El valor decimal que se desea parsear.
 * @returns {number} Valor numérico resultante. Devuelve 0 en caso de valor inexistente o inválido.
 */
function closureDecimalToNumber(decimalValue) {
    return decimalValue !== undefined && decimalValue !== null ? Number(decimalValue) : 0;
}

module.exports = { 
    getDashboardStats, 
    getHistorialCierres, 
    eliminarCierre 
};