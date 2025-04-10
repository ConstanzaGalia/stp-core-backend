export const registerEmail = (email: string, code: string, name: string, from: string) => {
  const mail = {
    to: email,
    subject:'¡Bienvenido a STP!, Confirmá tu email.',
    from,
    text: `Gracias por registrarte en Entrenamiento STP`,
    html: `<h2>${name} estás a un solo paso</h2>
    <h3>De formar parte de la mejor comunidad de entrenadores</h3>
    <p>Ingresá el siguiente código para confirmar tu dirección de correo electrónico</p>
    <button>${code}</button>
    `,
  }
  return mail;
};

export const resetPassEmail = (email: string, url: string, name: string, from: string) => {
  const mail = {
    to: email,
    subject:'¡Restablecé tu contraseña!',
    from,
    text: `Restablecé tu contraseña`,
    html: `<h2>${name} solicitaste cambiar la contraseña</h2>
    <p>Al hacer click en el siguiente enlace, podrás realizar el cambio de clave</p>
      <a href=${url}><button>Reset Password</button></a>
    `,
  }
  return mail;
};