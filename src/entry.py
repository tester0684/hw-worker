# Importamos Response y json directamente, eliminando WorkerEntrypoint
from workers import Response
import json
from typing import Optional

# ====================================================================
# CONFIGURACIÓN DE ENDPOINTS GLOBALES
# (Deben estar fuera de cualquier clase/función para ser globales)
# ====================================================================
CLOUDFLARE_ACCOUNT_ID = "bd5ed32b0fb79bff9258f69dcf4e6476"
R2_ENDPOINT_URL = f"https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
BUCKET_NAME = "hw-img-th" 
MAX_RECORDS = 16000 

class HotWheelsService:
    """Clase que contiene la lógica de negocio (sin heredar de WorkerEntrypoint)."""
    
    def __init__(self, env_bindings):
        # Inicialización de bindings
        self.db = env_bindings.DB_HW       
        self.r2_bucket = env_bindings.BUCKET_HW
        
    def _process_car_data(self, row: dict) -> dict:
        data = dict(row)
        image_filename = data.get('portada')
        if image_filename:
            data['portada_url'] = f"{R2_ENDPOINT_URL}/{BUCKET_NAME}/{image_filename}"
        else:
            data['portada_url'] = None
            
        try:
            # Deserializar y obtener la primera categoría
            cat_json = data.get('categoria')
            if cat_json:
                cat_list = json.loads(cat_json)
                data['categoria'] = cat_list[0] if cat_list else None 
        except:
            pass

        return data
        
    # Funciones de lógica de negocio (get_car_details y get_all_cars)
    async def get_car_details(self, model_id: str):
        query = "SELECT * FROM HotWheels WHERE id = ?"
        result = await self.db.prepare(query).bind(model_id).first()

        if not result:
            return Response(
                json.dumps({"error": f"Coche con ID '{model_id}' no encontrado."}), 
                status=404,
                headers={'Content-Type': 'application/json'}
            )
        processed_data = self._process_car_data(result)
        return Response(json.dumps(processed_data, indent=2), status=200, headers={'Content-Type': 'application/json'})

    async def get_all_cars(self):
        query = f"SELECT * FROM HotWheels LIMIT {MAX_RECORDS}"
        result = await self.db.prepare(query).all()
        
        if not result or not result.get('results'):
             return Response(
                json.dumps({"error": "No se encontraron registros de Hot Wheels."}), 
                status=404,
                headers={'Content-Type': 'application/json'}
            )

        data_list = [self._process_car_data(row) for row in result['results']]
            
        return Response(
            json.dumps(data_list), 
            status=200, 
            headers={'Content-Type': 'application/json'}
        )
    
# ====================================================================
# HANDLER PRINCIPAL fetch(request, env) - Nivel Superior
# ====================================================================

async def fetch(request, env):
    """Maneja todas las solicitudes entrantes y delega la lógica al servicio."""
    
    try:
        # 1. Instanciar el servicio con los bindings (env) inyectados
        service = HotWheelsService(env)
        
        # Obtener la ruta de la solicitud
        url_path = request.url.split('//')[1].split('/', 1)[1] 
        path_segments = url_path.split('/')
        
        # === ENRUTAMIENTO ===
        if 'all-models' in path_segments:
            return await service.get_all_cars()

        if 'modelo' in path_segments:
            model_index = path_segments.index('modelo')
            if model_index + 1 < len(path_segments):
                model_id = path_segments[model_index + 1]
                return await service.get_car_details(model_id)

        # Respuesta por defecto
        return Response(
            json.dumps({"message": "Bienvenido a HotWheels API. Usa /all-models o /modelo/{ID}"}),
            status=200, 
            headers={'Content-Type': 'application/json'}
        )

    except Exception as e:
        # Intentamos devolver el error en formato de texto
        return Response(f"Internal Server Exception: {e}", status=500)
