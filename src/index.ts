// Archivo: index.ts (TypeScript)

// Definición de las interfaces de los Bindings
interface Env {
    DB_HW: D1Database;
    BUCKET_HW: R2Bucket;
}

// Variables globales
const CLOUDFLARE_ACCOUNT_ID = "bd5ed32b0fb79bff9258f69dcf4e6476";
const R2_ENDPOINT_URL = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const BUCKET_NAME = "hw-img-th";
const ITEMS_PER_PAGE = 50; // Constante para la paginación

// =========================================================
// LÓGICA DE PROCESAMIENTO Y CONSULTAS
// =========================================================

function processCarData(row: Record<string, any>): Record<string, any> {
    const data = { ...row };
    const imageFilename = data.portada;

    // 1. Construir la URL de la imagen R2
    if (imageFilename) {
        data.portada_url = `${R2_ENDPOINT_URL}/${BUCKET_NAME}/${imageFilename}`;
    } else {
        data.portada_url = null;
    }

    // 2. Limpiar la categoría (Convertir de cadena JSON simple a cadena)
    try {
        if (data.categoria) {
            const catList = JSON.parse(data.categoria);
            // El frontend espera una cadena, no un array
            data.categoria = catList[0] || null; 
        }
    } catch {}

    return data;
}

async function getPaginatedCars(env: Env, url: URL): Promise<Response> {
    // 1. OBTENER PARÁMETROS DEL FRONTEND
    const page = parseInt(url.searchParams.get('page') || '1');
    const searchTerm = url.searchParams.get('query') || '';
    
    const offset = (page - 1) * ITEMS_PER_PAGE;
    const wildCardSearch = `%${searchTerm}%`;

    // 2. CONSTRUIR CLÁUSULAS WHERE Y BINDINGS
    let whereClause = '';
    let bindings: (string | number)[] = [];

    if (searchTerm) {
        whereClause = `
            WHERE modelo LIKE ? OR serie LIKE ? OR tipo LIKE ? OR marca LIKE ? OR categoria LIKE ?
        `;
        // Los 'bindings' deben coincidir con el número de ? en la consulta
        bindings.push(wildCardSearch, wildCardSearch, wildCardSearch, wildCardSearch, wildCardSearch);
    }
    
    // --- CONSULTA PRINCIPAL (DATOS) ---
    const dataQuery = `
        SELECT * FROM HotWheels
        ${whereClause}
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset};
    `;

    // --- CONSULTA DE CONTEO TOTAL (PAGINACIÓN) ---
    const countQuery = `
        SELECT COUNT(id) AS total_count FROM HotWheels
        ${whereClause};
    `;

    // 3. EJECUTAR CONSULTAS CONCURRENTEMENTE
    const [dataResult, countResult] = await Promise.all([
        env.DB_HW.prepare(dataQuery).bind(...bindings).all(),
        env.DB_HW.prepare(countQuery).bind(...bindings).first(),
    ]);
    
    const totalCount = countResult ? (countResult as { total_count: number }).total_count : 0;
    
    // 4. PROCESAR Y DEVOLVER DATOS
    const processedData = dataResult.results.map(processCarData);

    return new Response(JSON.stringify({
        data: processedData,
        page: page,
        limit: ITEMS_PER_PAGE,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / ITEMS_PER_PAGE)
    }), {
        headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*", // Abrimos CORS temporalmente para pruebas
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

// =========================================================
// HANDLER PRINCIPAL (PUNTO DE ENTRADA)
// =========================================================

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(segment => segment);

        // Manejo de solicitudes OPTIONS (CORS Preflight)
        if (request.method === "OPTIONS") {
            const headers = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            };
            return new Response(null, { status: 204, headers });
        }
        
        try {
            // 1. Ruta principal de Listado y Búsqueda: /list
            if (pathSegments.includes('list')) {
                return await getPaginatedCars(env, url);
            }
            
            // 2. Ruta de Detalle por ID (si la necesitas)
            // ... (Lógica para /modelo/{ID}) ...

            // Respuesta por defecto
            return new Response(JSON.stringify({ 
                message: "Bienvenido a HotWheels API. Usa /list?page=1&query=..." 
            }), { status: 200, headers: { 'content-type': 'application/json' } });
            
        } catch (e) {
            console.error(e);
            return new Response(`Error 500: Fallo interno del Worker.`, { status: 500 });
        }
    }
} satisfies ExportedHandler<Env>;
