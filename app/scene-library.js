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
  // --- por revisar (segunda tanda, de memoria) ---
  // amaneceres y atardeceres
  { id:'photo-1494548162494-384bba4ab999', w:['clear','clouds'], t:['dawn','dusk'], m:['esperanza','gratitud','paz'], note:'cielo al amanecer' },
  { id:'photo-1507400492013-162706c8c05e', w:['clear','clouds'], t:['dusk','dawn'], m:['gratitud','paz','fe'], note:'atardecer en las montañas' },
  { id:'photo-1490730141103-6cac27aaab94', w:['clear','clouds'], t:['dusk'], m:['gratitud','paz','descanso'], note:'atardecer en el campo' },
  { id:'photo-1475924156734-496f6cac6ec1', w:['clear','clouds'], t:['dusk'], m:['gratitud','esperanza'], note:'atardecer sobre el mar' },
  { id:'photo-1504701954957-2010ec3bcec1', w:['clear','clouds'], t:['dawn'], m:['esperanza','propósito','ánimo'], note:'amanecer en las montañas' },
  { id:'photo-1500530855697-b586d89ba3ee', w:['clear','clouds'], t:['dusk','dawn'], m:['paz','gratitud','alegría'], note:'cielo dorado' },
  // montañas y valles
  { id:'photo-1506905925346-21bda4d32df4', w:['clear','clouds'], t:['day','dawn'], m:['fortaleza','dirección','fe'], note:'cumbres sobre las nubes' },
  { id:'photo-1464822759023-fed622ff2c3b', w:['clear'], t:['day'], m:['fortaleza','propósito','ánimo'], note:'montaña imponente' },
  { id:'photo-1472396961693-142e6e269027', w:['clear','clouds'], t:['day','dawn'], m:['paz','descanso','familia'], note:'venado en la pradera' },
  { id:'photo-1470770841072-f978cf4d019e', w:['clear','clouds'], t:['day','dawn'], m:['paz','descanso','familia'], note:'lago y cabaña' },
  { id:'photo-1426604966848-d7adac402bff', w:['clear','clouds'], t:['day'], m:['paz','esperanza','sanidad'], note:'lago y bosque' },
  { id:'photo-1439066615861-d1af74d74000', w:['clear','clouds'], t:['day'], m:['paz','ansiedad','descanso'], note:'lago tranquilo' },
  { id:'photo-1476610182048-b716b8518aae', w:['clear'], t:['day'], m:['dirección','fortaleza','fe'], note:'valle con montañas' },
  // bosque y naturaleza
  { id:'photo-1447752875215-b2761acb3c5d', w:['clear','clouds'], t:['day'], m:['dirección','esperanza','paz'], note:'camino en el bosque' },
  { id:'photo-1448375240586-882707db888b', w:['clear'], t:['dawn','day'], m:['esperanza','fe','gratitud'], note:'rayos de luz en el bosque' },
  { id:'photo-1473448912268-2022ce9509d8', w:['clear','clouds'], t:['day'], m:['paz','sanidad','descanso'], note:'bosque verde' },
  { id:'photo-1502082553048-f009c37129b9', w:['clear','clouds'], t:['day'], m:['paz','esperanza','fortaleza'], note:'árboles altos' },
  { id:'photo-1465146344425-f00d5f5c8f07', w:['clear','clouds'], t:['day'], m:['alegría','gratitud','sanidad'], note:'campo de flores' },
  { id:'photo-1490750967868-88aa4486c946', w:['clear','clouds'], t:['day'], m:['alegría','sanidad','familia'], note:'flores' },
  // mar y agua
  { id:'photo-1507090960745-b32f65d3113a', w:['clear','clouds'], t:['day'], m:['paz','ansiedad','descanso'], note:'olas del mar' },
  { id:'photo-1519046904884-53103b34b206', w:['clear'], t:['day'], m:['alegría','descanso','gratitud'], note:'playa tranquila' },
  { id:'photo-1473116763249-2faaef81ccda', w:['clear'], t:['day'], m:['alegría','gratitud','descanso'], note:'costa y cielo' },
  // lluvia y tormenta
  { id:'photo-1428592953211-077101b2021b', w:['rain'], m:['tristeza','duelo','soledad','ansiedad'], note:'lluvia en la ventana' },
  { id:'photo-1515694346937-94d85e41e6f0', w:['rain'], m:['tristeza','soledad','duelo'], note:'día de lluvia' },
  { id:'photo-1503435824048-a799a3a84bf7', w:['rain','storm'], m:['miedo','ansiedad','fortaleza'], note:'cielo de tormenta' },
  { id:'photo-1527482797697-8795b05a13fe', w:['storm'], m:['miedo','fortaleza','fe'], note:'tormenta con relámpagos' },
  { id:'photo-1492011221367-f47e3ccd77a0', w:['storm'], t:['dusk','night'], m:['miedo','fortaleza','fe'], note:'relámpago en la noche' },
  // niebla
  { id:'photo-1477346611705-65d1883cee1e', w:['fog','clouds'], m:['paz','ansiedad','soledad'], note:'montañas con niebla' },
  { id:'photo-1542273917363-3b1817f69a2d', w:['fog'], m:['paz','soledad','duelo'], note:'bosque con bruma' },
  { id:'photo-1425913397330-cf8af2ff40a1', w:['fog','clouds'], m:['paz','descanso','tristeza'], note:'lago entre la niebla' },
  { id:'photo-1511884642898-4c92249e20b6', w:['fog','clouds'], m:['paz','soledad','esperanza'], note:'montañas y lago en bruma' },
  // nieve
  { id:'photo-1483728642387-6c3bdd6c93e5', w:['snow'], m:['paz','descanso','fe'], note:'montaña nevada' },
  { id:'photo-1418985991508-e47386d96a71', w:['snow'], m:['paz','soledad','descanso'], note:'bosque con nieve' },
  { id:'photo-1477601263568-180e2c6d046e', w:['snow'], m:['paz','fe','esperanza'], note:'paisaje nevado' },
  { id:'photo-1486870591958-9b9d0d1dda99', w:['snow'], m:['soledad','paz','descanso'], note:'invierno' },
  // noche y estrellas
  { id:'photo-1483977399921-6cf94f6fdc3a', w:['clear'], t:['night'], m:['miedo','soledad','fe','no puedo dormir'], note:'cielo estrellado' },
  { id:'photo-1532978379173-523e16f371f2', w:['clear'], t:['night'], m:['fe','paz','soledad'], note:'estrellas' },
  { id:'photo-1464802686167-b939a6910659', w:['clear'], t:['night'], m:['fe','adoración','paz'], note:'vía láctea' },
  { id:'photo-1419242902214-272b3f66ee7a', w:['clear'], t:['night'], m:['fe','no puedo dormir','paz'], note:'noche de estrellas' },
  { id:'photo-1444703686981-a3abbc4d4fe3', w:['clear'], t:['night'], m:['fe','adoración','esperanza'], note:'cielo nocturno' },
];
