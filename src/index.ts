import { Env } from "."; // Asumo que Env se define aquí o en un archivo cercano

export default {
  async fetch(request, env) {
    // 1. Ejecutar la consulta SQL (puedes ajustar el LIMIT a tu necesidad)
    const stmt = env.DB.prepare("SELECT * FROM HotWheels LIMIT 500"); 
    const { results } = await stmt.all();

    // 2. Definir las cabeceras CORS para permitir el acceso desde tu frontend
    const headers = {
      // **IMPORTANTE 1: Establecer el Content-Type correcto para JSON**
      "content-type": "application/json", 
      
      // **IMPORTANTE 2: Cabecera CORS para permitir tu frontend**
      // Reemplaza 'https://drivo-db.pages.dev' si tu dominio es diferente, o usa '*' para acceso universal
      "Access-Control-Allow-Origin": "https://drivo-db.pages.dev", 
      
      // Cabeceras CORS adicionales para solicitudes OPTIONS (preflight)
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Manejo de la solicitud OPTIONS (necesario para CORS)
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
    }
    
    // 3. Devolver la respuesta como JSON
    // El frontend necesita un array de datos, no HTML.
    return new Response(JSON.stringify(results), { 
      headers: headers,
    });
  },
} satisfies ExportedHandler<Env>;
