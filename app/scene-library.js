/*
 * HERE — biblioteca de escenas (fotos de fondo).
 *
 * Cada entrada es una foto de Unsplash (el "id" es la parte de la URL que
 * empieza con "photo-", sin el dominio). HERE elige la que mejor encaja con el
 * clima real de la persona, la hora del día y el tema del versículo, y rota
 * entre ellas día a día.
 *
 *   w : clima en el que queda bien  → clear, clouds, fog, rain, storm, snow
 *   t : momento del día             → dawn, day, dusk, night
 *   m : ánimos / temas del versículo → paz, miedo, tristeza, esperanza…
 *
 * Si falta "w" o "t", la foto sirve para cualquier clima / momento.
 * Para agregar una foto: copia una línea, cambia el id y las etiquetas.
 * Para quitar una: bórrala. Abre scenes-preview.html para revisarlas todas
 * (las que no carguen se marcan en rojo; HERE además salta solo las que fallen).
 *
 * Las fotos marcadas "en uso" ya se usaban en la app. Las marcadas "por
 * revisar" se agregaron de memoria: confirma en scenes-preview.html que
 * cargan y que muestran lo que dice la etiqueta.
 */
window.SCENE_LIBRARY = [
  // --- en uso ---
  { id:'photo-1470252649378-9c29740c9fa8', w:['clear','clouds'], t:['dawn','dusk'], m:['gratitud','esperanza','alegría','relaciones','propósito'], note:'amanecer cálido' },
  { id:'photo-1518837695005-2083093ee35b', w:['clear','clouds'], t:['day'], m:['ansiedad','paz','descanso'], note:'agua turquesa' },
  { id:'photo-1603437873662-dc1f44901825', w:['clear'], t:['day'], m:['paz','fe','alegría'], note:'cielo azul' },
  { id:'photo-1470432581262-e7880e8fe79a', w:['rain','storm','fog'], m:['tristeza','duelo','herido','soledad'], note:'lluvia' },
  { id:'photo-1595104615356-cbe9c4364513', w:['clear','clouds'], t:['day'], m:['familia','enfermedad','sanidad'], note:'naturaleza verde' },
  { id:'photo-1595661671412-e20c4a3e65cc', w:['clouds','fog'], t:['dawn','day','dusk'], m:['fe','adoración','oración'], note:'nubes' },
  { id:'photo-1500964757637-c85e8a162699', w:['clear','clouds'], t:['day'], m:['dirección','propósito','ánimo','fortaleza'], note:'montañas' },
  { id:'photo-1534796636912-3b95b3ab5986', w:['clear','clouds'], t:['night'], m:['miedo','soledad','no puedo dormir','paz'], note:'noche estrellada' },
  { id:'photo-1561212856-44e9bae482aa', t:['dusk','night'], m:['oración','paz','no puedo dormir'], note:'luz de vela' },
  // --- por revisar ---
  { id:'photo-1506744038136-46273834b3fb', w:['clear'], t:['day'], m:['dirección','propósito','fortaleza'], note:'valle y montañas' },
  { id:'photo-1501785888041-af3ef285b470', w:['clear','clouds'], t:['day'], m:['paz','ansiedad','descanso'], note:'lago' },
  { id:'photo-1469474968028-56623f02e42e', w:['clear','clouds'], t:['dawn'], m:['esperanza','gratitud','alegría'], note:'amanecer sobre el valle' },
  { id:'photo-1470071459604-3b5ec3a7fe05', w:['fog'], m:['paz','soledad','ansiedad'], note:'niebla en el bosque' },
  { id:'photo-1519681393784-d120267933ba', w:['clear'], t:['night'], m:['miedo','soledad','fe'], note:'estrellas sobre montañas' },
  { id:'photo-1472214103451-9374bd1c798e', w:['clear'], t:['day'], m:['alegría','familia','gratitud'], note:'campo verde' },
  { id:'photo-1500382017468-9049fed747ef', w:['clear','clouds'], t:['day','dusk'], m:['alegría','gratitud','paz'], note:'campo abierto' },
  { id:'photo-1491002052546-bf38f186af56', w:['snow'], m:['paz','fe'], note:'montañas nevadas' },
  { id:'photo-1511497584788-876760111969', w:['fog','rain'], m:['paz','soledad','tristeza'], note:'pinos en la niebla' },
  { id:'photo-1505118380757-91f5f5632de0', w:['clear','clouds'], t:['day'], m:['ansiedad','paz','descanso'], note:'mar' },
  { id:'photo-1433086966358-54859d0ed716', w:['clear','clouds','rain'], t:['day'], m:['sanidad','esperanza','paz'], note:'cascada' },
  { id:'photo-1418065460487-3e41a6c84dc5', w:['fog','clouds','rain'], m:['tristeza','duelo','soledad'], note:'bosque con niebla' },
  { id:'photo-1441829266145-5a7f74e46ca7', w:['clear'], t:['dawn','day'], m:['esperanza','fe','propósito'], note:'luz entre los árboles' },
  { id:'photo-1507525428034-b723cf961d3e', w:['clear'], t:['day'], m:['alegría','gratitud'], note:'playa' },
];
