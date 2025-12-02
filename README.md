# Generador de Fixtures Deportivos

Esta aplicación permite generar calendarios (fixtures) de torneos deportivos de forma flexible y configurable.  Se diseñó para cubrir las necesidades de los sistemas de competencia utilizados en los Juegos Evita y eventos similares, donde existen variables como la cantidad de equipos, el número de días de competencia, las canchas disponibles, la duración de cada partido y las pausas obligatorias entre encuentros.

## Características

- **Gestión de equipos**: Permite importar equipos a partir de un archivo CSV (con columnas `Zona;Equipo`), crear equipos manualmente, asignarlos a zonas y eliminarlos.  Se pueden gestionar entre 12 y 24 equipos, organizados en grupos según el sistema de competencia elegido (por ejemplo, 8 zonas de 3 equipos o 4 zonas de 6 equipos).
- **Generación de fixture**: A partir de los parámetros de configuración (días de torneo, horas de inicio y fin, duración de los partidos, descanso entre partidos, canchas disponibles, corte al mediodía, etc.) genera de manera automática el orden de partidos para cada ronda.  Los algoritmos incluyen:
  - **Round Robin**: genera calendarios todos contra todos para grupos de tamaño arbitrario, con opción de ida/vuelta.
  - **Agrupaciones 8×3 y 4×6**: agrupa equipos en zonas de 3 o 6 y crea rondas para cada grupo.
- **Asignación de fechas, horarios y canchas**: El motor asigna cada partido al primer horario disponible que cumpla con los descansos mínimos para ambos equipos y respete la disponibilidad de canchas.  Se puede definir una pausa al mediodía (por ejemplo, entre las 12:00 y las 14:00) y un máximo de partidos por día y por cancha.
- **Exportación a PDF**: Una vez generada la programación, se puede exportar a PDF con una tabla ordenada por día, que incluye fecha, hora, cancha, local, visitante, zona, fase/ronda e identificador de partido.
- **API REST**: Se incluye un servidor Flask que expone rutas para cargar equipos, generar calendarios y descargar la programación en formato JSON o PDF.  Esto facilita la integración con una interfaz web o aplicaciones móviles.

## Requisitos

Para instalar las dependencias del proyecto, ejecute:

```bash
pip install -r requirements.txt
```

## Uso rápido

1. Copie el archivo `EQS-8X3.csv` en el directorio raíz del proyecto o modifique la ruta según sea necesario.  Este archivo es un ejemplo de equipos organizados en ocho zonas de tres equipos cada una.
2. Inicie el servidor Flask ejecutando:

```bash
python app.py
```

3. Utilice la ruta `/generate` para generar un fixture enviando un JSON con la configuración deseada.  Por ejemplo, para un torneo de cinco días, dos canchas, partidos de 60 minutos y descanso mínimo de 60 minutos:

```bash
curl -X POST http://localhost:5000/generate \
     -H "Content-Type: application/json" \
     -d '{
         "teams_csv": "EQS-8X3.csv",
         "system": "8x3",
         "days": 5,
         "fields": 2,
         "start_time": "09:00",
         "end_time": "18:00",
         "match_duration": 60,
         "rest": 60,
         "midday_break": ["12:00", "14:00"],
         "home_and_away": false
     }'
```

La respuesta incluirá la lista de partidos con la asignación de día, hora y cancha.  Para exportar a PDF, se puede invocar la ruta `/export_pdf` pasando el mismo identificador de torneo.

## Organización del código

* **`fixture_generator.py`**: Contiene las clases y funciones encargadas de generar los calendarios y asignar horarios.
* **`app.py`**: Servidor Flask con rutas REST para gestionar equipos, generar fixtures y exportar a PDF.
* **`requirements.txt`**: Lista de dependencias Python necesarias.

El proyecto está preparado para ampliarse con una interfaz web (por ejemplo, React) que consuma la API.  También se puede conectar a Firebase u otro servicio de bases de datos para almacenar las configuraciones y los resultados.