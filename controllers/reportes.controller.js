const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE ANALYTICS, CAJA Y GESTIÓN DE CIERRES
// ==========================================

/**
 * Procesa y extrae las métricas del Dashboard (BI de la empresa).
 * Estructura los datos limpios listos para ser consumidos por Chart.js.
 * @async
 * @function getDashboardStats
 * @param {import('express').Request} req - Objeto de petición HTTP (incluye query params de fechas: inicio y fin).
 * @param {import('express').Response} res - Objeto de respuesta HTTP utilizado para enviar las métricas o un mensaje de error.
 * @returns {Promise<void>} Promesa vacía ya que responde directamente al cliente con la información estructurada.
 */
const getDashboardStats = async (req, res) => {
    try {
        const { inicio, fin } = req.query;
        
        // 🛡️ Filtro dinámico estructurado con operadores de Prisma
        // Construye el filtro de fechas si ambos parámetros están presentes.
        const filterClause = {};
        if (inicio && fin) {
            filterClause.fecha = {
                gte: new Date(inicio),
                lte: new Date(`${fin}T23:59:59.999Z`) // Cerramos el rango del día completo para incluir todas las horas
            };
        }

        // 1. RENDIMIENTO POR MESA (Agregación eficiente)
        // Agrupamos las ventas por id de mesa dentro del rango establecido
        const agrupacionVentasMesas = await prisma.ventas.groupBy({
            by: ['mesa_id'],
            _sum: {
                total_final: true
            },
            where: filterClause
        });

        // Traemos el catálogo de mesas para mapear los IDs con los números reales expuestos al público
        const catalogoMesas = await prisma.mesas.findMany({
            select: { id: true, numero_mesa: true }
        });

        // Calculamos la recaudación cruzando la agregación con el catálogo de mesas
        const estadisticasMesas = catalogoMesas.map(m => {
            const matchingVenta = agrupacionVentasMesas.find(v => v.mesa_id === m.id);
            return {
                numero_mesa: m.numero_mesa,
                recaudacion: matchingVenta && matchingVenta._sum.total_final 
                    ? Number(matchingVenta._sum.total_final) 
                    : 0
            };
        }).sort((a, b) => b.recaudacion - a.recaudacion);


        // 2. TOP PRODUCTOS (Los 5 más vendidos mediante agregación indexada)
        // Agrupamos los pedidos que ya fueron pagados
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

        // Extraemos los nombres cruzando la información con el catálogo
        const itemIds = agrupacionProductos.map(ap => ap.producto_id).filter(id => id !== null);
        const catalogoProductos = await prisma.productos.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, nombre: true }
        });

        // Generamos la lista final de los productos más vendidos con sus nombres
        const estadisticasProductos = agrupacionProductos.map(ap => {
            const matchProd = catalogoProductos.find(p => p.id === ap.producto_id);
            return {
                nombre: matchProd ? matchProd.nombre : 'Desconocido',
                total_vendido: ap._sum.cantidad || 0
            };
        });


        // 3. FLUJO DE CAJA (Efectivo vs Digital / Mixto)
        // Agrupamos los ingresos para clasificar las ventas por su método de pago
        const agrupacionMetodos = await prisma.ventas.groupBy({
            by: ['metodo_pago'],
            _sum: {
                total_final: true
            },
            where: filterClause
        });

        // Convertimos los resultados de la agrupación en un formato estándar para el cliente
        const estadisticasMetodos = agrupacionMetodos.map(am => ({
            metodo_pago: am.metodo_pago || 'EFECTIVO',
            monto: am._sum.total_final ? Number(am._sum.total_final) : 0
        }));

        // 4. ADVANCED BI: Horas Pico y Días más rentables
        // Obtenemos todas las ventas para hacer analítica temporal
        const todasLasVentas = await prisma.ventas.findMany({
            where: filterClause,
            select: { fecha: true, total_final: true }
        });

        const horasPicoMap = {};
        const diasRentablesMap = {};
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // Recorremos las ventas para segmentarlas por hora y día de la semana
        todasLasVentas.forEach(v => {
            if (v.fecha) {
                const dateObj = new Date(v.fecha);
                const hour = dateObj.getHours();
                const dayIdx = dateObj.getDay();
                const dia = diasSemana[dayIdx];
                const total = Number(v.total_final) || 0;

                horasPicoMap[hour] = (horasPicoMap[hour] || 0) + 1; // Incrementamos la frecuencia de transacciones
                diasRentablesMap[dia] = (diasRentablesMap[dia] || 0) + total; // Acumulamos la sumatoria de ingresos
            }
        });

        // Formateamos y ordenamos las 5 horas con mayor cantidad de transacciones
        const estadisticasHoras = Object.keys(horasPicoMap).map(h => ({
            hora: `${String(h).padStart(2, '0')}:00`,
            frecuencia: horasPicoMap[h]
        })).sort((a, b) => b.frecuencia - a.frecuencia).slice(0, 5); // Las 5 horas más movidas

        // Ordenamos los días de la semana según el ingreso total generado
        const estadisticasDias = Object.keys(diasRentablesMap).map(d => ({
            dia: d,
            ingreso: diasRentablesMap[d]
        })).sort((a, b) => b.ingreso - a.ingreso);

        // Retornamos la estructura limpia lista para renderizar en los gráficos
        res.json({
            mesas: estadisticasMesas,
            productos: estadisticasProductos,
            metodos: estadisticasMetodos,
            horas: estadisticasHoras,
            dias: estadisticasDias
        });

    } catch (error) {
        console.error("⚠️ [ANALYTICS ENGINE ERROR]:", error);
        res.status(500).json({ error: "Fallo en el procesamiento de BI de la plataforma." });
    }
};

/**
 * Recupera la bitácora histórica de cierres de caja efectuados.
 * Controla la mutación de tipos complejos (BigInt y Decimal) antes del envío HTTP.
 * @async
 * @function getHistorialCierres
 * @param {import('express').Request} req - Objeto de petición HTTP.
 * @param {import('express').Response} res - Objeto de respuesta HTTP utilizado para enviar la lista de cierres.
 * @returns {Promise<void>} Promesa vacía que responde con los registros o un arreglo vacío en caso de error.
 */
const getHistorialCierres = async (req, res) => {
    try {
        // Obtenemos la bitácora histórica ordenada por la fecha de cierre más reciente
        const historialRaw = await prisma.cierres.findMany({
            orderBy: {
                fecha_cierre: 'desc'
            },
            take: 50
        });

        // 🛡️ SOLUCIÓN AL QUIEBRE DE BIGINT: Mapeamos los registros mitigando el error de JSON stringify
        // Esto es esencial ya que `JSON.stringify` no puede serializar valores BigInt nativos de JS
        const historialFormateado = historialRaw.map(cierre => ({
            ...cierre,
            id: closureIdToString(cierre.id), // Transformación segura a String del ID
            total_ventas: closureDecimalToNumber(cierre.total_ventas), // Conversión de decimal a number
            total_gastos: closureDecimalToNumber(cierre.total_gastos)
        }));

        res.json(historialFormateado);
    } catch (error) {
        console.error("⚠️ Error leyendo historial de cierres:", error);
        res.json([]); // Fail-safe: Evitamos que la UI colapse enviando un arreglo vacío
    }
};

/**
 * Ejecuta la revocación y remoción de un cierre de caja específico.
 * Registra inmediatamente la acción en el log forense del sistema.
 * @async
 * @function eliminarCierre
 * @param {import('express').Request} req - Objeto de petición HTTP (contiene el ID a eliminar por params y el usuario logueado).
 * @param {import('express').Response} res - Objeto de respuesta HTTP para confirmar la eliminación.
 * @returns {Promise<void>} Promesa vacía que devuelve un objeto { success: true } o lanza un error HTTP 500.
 */
const eliminarCierre = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Convertimos a BigInt explícitamente ya que coincide con el mapeo del motor de base de datos
        const idBigInt = BigInt(id);

        // Eliminación física indexada por llave primaria
        // Borramos el registro permanentemente de la base de datos
        await prisma.cierres.delete({
            where: { id: idBigInt }
        });
        
        // 🔒 ESPÍA AUDITORÍA: Trazabilidad forense obligatoria de operaciones financieras
        try {
            // Intentamos guardar el evento en la bitácora de auditoría para fines de seguridad
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

/**
 * Convierte un valor BigInt en una cadena de texto (String) para poder serializarlo en JSON.
 * @function closureIdToString
 * @param {BigInt|number|string} bigintValue - Valor numérico grande u original proveniente de la base de datos.
 * @returns {string|null} Retorna el valor en texto, o null si el valor ingresado es indefinido o nulo.
 */
function closureIdToString(bigintValue) {
    return bigintValue !== undefined && bigintValue !== null ? bigintValue.toString() : null;
}

/**
 * Convierte un valor de tipo Decimal devuelto por Prisma en un valor de tipo Number en JavaScript.
 * @function closureDecimalToNumber
 * @param {import('@prisma/client/runtime/library').Decimal|number|string} decimalValue - El valor decimal en formato objeto de Prisma.
 * @returns {number} El valor convertido a un número flotante nativo de JavaScript, o 0 si no es válido.
 */
function closureDecimalToNumber(decimalValue) {
    return decimalValue !== undefined && decimalValue !== null ? Number(decimalValue) : 0;
}

module.exports = { 
    getDashboardStats, 
    getHistorialCierres, 
    eliminarCierre 
};