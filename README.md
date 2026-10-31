# Tienda Las Amapolas

Sitio web adaptable a celular para Tienda Las Amapolas, La Guácima, Alajuela. Usa HTML, CSS y JavaScript en el frente, con un backend Node/Express y una base de datos SQLite para el catálogo y el acceso administrativo.

## Editar la información

- **Productos, fotos, precios y existencias:** crealos, editalos y eliminalos desde `/gestion`. Los cambios se guardan en `data/amapolas.db`; las fotos se seleccionan desde el equipo. `products-data.js` contiene una sola ficha vacía de demostración como respaldo inicial.
- **Catálogo público:** la tienda sirve para consultar productos y disponibilidad; no incluye carrito ni opción para hacer compras en línea. Las rutas antiguas del carrito redirigen al catálogo.
- **Horario, correo, teléfono, WhatsApp y enlaces:** editá `config.js`. El horario se usa en el indicador de abierto/cerrado y en los pies de página. El número de WhatsApp debe ir en formato internacional, solo dígitos y con prefijo de país (`506` para Costa Rica). Instagram está configurado como `@amapolas_esencial`; `directionsUrl` define el destino de los botones «Cómo llegar».
- **Formulario de contacto:** el envío usa FormSubmit, configurado a `info@tiendalasamapolas.com`. La persona responsable debe confirmar la dirección mediante el primer mensaje de activación que envía el servicio; hasta completar ese paso, el proveedor no entregará mensajes. Si la tienda prefiere otro proveedor, cambiá `contactFormEndpoint` y el manejo de respuesta de `app.js`.
- **Página de contacto:** está disponible en `/contacto.html` desde la navegación y el pie de página. Ofrece contacto por llamada, correo, WhatsApp y formulario.
- **Fotografías:** la sección de historia usa la foto de fachada compartida por la tienda, guardada en `assets/fachada-tienda.jpg`. La portada y las categorías usan fotografías de referencia de Unsplash; sustituí sus URL en `index.html` por fotos propias autorizadas. Las fotos del catálogo cargan de forma diferida.
- **Historia y reseñas:** la sección de historia usa la foto de fachada compartida por la tienda. Las reseñas y fotos de perfil mostradas en `index.html` fueron proporcionadas por la tienda.
- **Marca y estilos:** el logo compartido por la tienda está en `assets/logo-amapolas.jpg`. Los colores y estilos están centralizados en las variables de `styles.css`.

El inicio de sesión de clientes y los perfiles siguen siendo una demostración local y se guardan en el navegador. El panel usa una sesión del backend. `/gestion` no es una medida de seguridad por sí sola: las operaciones de guardar, publicar y eliminar también se protegen y verifican en el servidor.

### Seguridad del panel

- Definí `ADMIN_PASSWORD` con una contraseña única de al menos 12 caracteres y `SESSION_SECRET` con una cadena aleatoria larga antes de iniciar el servidor. No las publiques ni las guardes en el código. En Windows podés generarla con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y guardarla en las variables de entorno de usuario; luego cerrá y volvé a abrir la terminal.
- El servidor exige `ADMIN_PASSWORD` y sincroniza con ella la contraseña administrativa al iniciar; así la contraseña inicial conocida deja de funcionar. Para cambiarla, actualizá la variable y reiniciá el servidor. La contraseña no se imprime ni se guarda en el código.
- El inicio de sesión limita los intentos fallidos; la sesión cambia de identificador al autenticarse, vence a las dos horas y usa cookies `HttpOnly` y `SameSite`. Las operaciones administrativas solo aceptan solicitudes del mismo origen.
- En producción configurá `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_PASSWORD` y HTTPS. En caso de usar un proxy HTTPS delante del servidor, configurá además `TRUST_PROXY=true`. No expongas el panel por HTTP público.
- Conservá copias de seguridad de `data/amapolas.db`: la autenticación reduce el riesgo de acceso, pero no sustituye los respaldos.

## Probar y publicar

Instalá las dependencias con `npm install`, configurá las variables de seguridad y ejecutá `npm start`. La tienda queda disponible en `http://localhost:3000` y el panel en `http://localhost:3000/gestion`. El catálogo público se carga desde la API del backend; abrir `index.html` directamente como archivo no activa esa API.

El despliegue necesita un entorno Node.js que mantenga los archivos y la base SQLite persistentes; un hosting puramente estático no ejecutará el panel ni guardará productos.

## Por confirmar con la tienda

- Que `info@tiendalasamapolas.com` esté activo y cuál servicio de formulario se usará.
- El número de WhatsApp y si es el mismo teléfono publicado.
- El horario definitivo.
- El catálogo, precios y disponibilidad reales.
- Fotos propias de la tienda, la fachada y los productos.
