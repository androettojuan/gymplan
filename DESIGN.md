# GymPlan — diseño

App para gimnasios: el dueño y los profes arman planes de entrenamiento y se los mandan a los socios con un link. El socio entra con Google, ve su plan, anota sus pesos y ve su progreso.

## Roles (por gimnasio)

| Rol | Puede |
|---|---|
| Súper admin (global) | Crear gimnasios y generar el link del dueño de cada uno. Se define por email en `firestore.rules` (`isSuper`) y en `src/lib/admin.ts`. |
| `owner` (dueño) | Todo lo de `staff`, más: agregar y quitar empleados, cambiar roles, editar los datos del gimnasio. |
| `staff` (empleado / profe) | Crear y editar plantillas y planes; invitar socios; ver socios y su progreso. |
| `member` (socio) | Ver su plan, anotar sus pesos y su peso corporal, ver su progreso. |

Una persona puede estar en varios gimnasios con roles distintos.

## Planes

- **Plantilla** (`templates`): un plan reutilizable, por ejemplo "Principiante 3 días".
- **Asignación**: cada socio tiene en su membresía un `templateId`. Si la plantilla cambia, el socio ve el cambio.
- **Plan personalizado** (`plans/{uid}`): si el profe ajusta el plan solo para un socio, se copia la plantilla y desde ahí es independiente. Si existe, tiene prioridad sobre la plantilla.
- Cada vez que se guarda una plantilla o un plan personalizado se guarda una versión en `versions`, para tener historial.
- Los pesos del socio se guardan por **clave de ejercicio** (`exKey`). Si el plan cambia y el ejercicio sigue, el historial continúa.
- Los planes se arman en un editor o se importan desde el PDF que usan hoy los gimnasios (planilla con columnas Ejercicio / Video / Series / Reps / Descanso / Observaciones).

## Datos (Firestore)

```
gyms/{gymId}                         { name, createdAt, createdBy }
gyms/{gymId}/members/{uid}           { role, name, email, photoURL, joinedAt, inviteId, templateId? }
gyms/{gymId}/members/{uid}/logs/{exKey}   { name, entries: [{ d, w, r, n }] }      ← escribe el socio
gyms/{gymId}/members/{uid}/body/main      { entries: [{ d, w }] }                  ← escribe el socio
gyms/{gymId}/exercises/{exId}        { name, videoUrl, group, notes }
gyms/{gymId}/templates/{tplId}       { name, notes[], days[], updatedAt, updatedBy }
gyms/{gymId}/templates/{tplId}/versions/{vId}
gyms/{gymId}/plans/{uid}             { name, notes[], days[], baseTemplateId, updatedAt, updatedBy }
gyms/{gymId}/plans/{uid}/versions/{vId}
invites/{token}                      { gymId, gymName, role, templateId?, single, usedBy?, createdBy, createdAt, expiresAt, active }
users/{uid}/gyms/{gymId}             { role, gymName, joinedAt }      ← índice "mis gimnasios"
```

`days[]`: `{ title, exercises: [{ exKey, name, sets, reps, rest, obs, video }] }`.

## Invitaciones (sin servidor propio)

Todo se valida con las reglas de Firestore, sin Cloud Functions (así se puede usar el plan gratis de Firebase).

1. Un profe o el dueño crea `invites/{token}` (token aleatorio de 20 caracteres). El link es `/join/{token}`.
2. La persona abre el link y entra con Google. La app lee la invitación (cualquiera con sesión iniciada puede leer una invitación si conoce el token; listar invitaciones no está permitido).
3. En un solo batch la app crea `gyms/{gymId}/members/{uid}` y `users/{uid}/gyms/{gymId}`. Si la invitación es de un solo uso, además marca `usedBy`.
4. Las reglas verifican que la invitación exista, esté activa y vigente, sea del mismo gimnasio, que el rol coincida y, si es de un solo uso, que no se haya usado.

Quién crea cada tipo de link: los de **socio**, el dueño o un empleado; los de **empleado**, solo el dueño; los de **dueño**, solo el súper admin. Los de empleado y dueño son siempre de un solo uso. Los de socio pueden ser de un solo uso (un link por persona, con plantilla asignada) o generales (un link del gimnasio para cualquier socio nuevo).

Alguien que entra sin invitación ve un aviso de que necesita el link de su gimnasio (normalmente por WhatsApp).

## Crear un gimnasio

Solo el súper admin, desde `/admin`. En un batch se crea `gyms/{gymId}` (`{ name, createdAt, createdBy }`) y una invitación de rol `owner`. El dueño entra con ese link como cualquier otro usuario. Desde **Equipo** el dueño agrega a sus empleados.

## Tecnología

- React + TypeScript + Vite, react-router.
- Firebase: Authentication (Google) y Firestore con caché local (funciona sin señal).
- Firebase Hosting. PWA instalable en Android.
- Lector de PDF: pdf.js, mismo algoritmo que Libreta de Gym.

## Pendiente / más adelante

- Política de privacidad (Ley 25.326, datos personales de los socios).
- Cobro por gimnasio.
- Notificaciones cuando el profe actualiza el plan.
