export const registerEmail = (email: string, code: string, name: string, from: string) => {
  // Validar que el email no sea null o undefined
  if (!email || email.trim() === '') {
    throw new Error('Email is required for registration email');
  }

  const mail = {
    to: email.trim(),
    subject: '¡Bienvenido a STP!, Confirmá tu email.',
    from,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Confirmación de Email - STP</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 40px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">STP</h1>
              <p style="color: #666; margin: 10px 0;">Entrenamiento Profesional</p>
            </div>
            
            <h2 style="color: #333; text-align: center;">¡Hola ${name}!</h2>
            <h3 style="color: #555; text-align: center;">Estás a un solo paso de formar parte de la mejor comunidad de entrenadores</h3>
            
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center; margin: 30px 0;">
              <p style="color: #666; margin-bottom: 20px;">Ingresá el siguiente código para confirmar tu dirección de correo electrónico:</p>
              <div style="background-color: #007bff; color: white; padding: 15px 30px; border-radius: 5px; font-size: 24px; font-weight: bold; display: inline-block;">
                ${code}
              </div>
            </div>
            
            <p style="color: #666; text-align: center; font-size: 14px;">
              Si no solicitaste este código, puedes ignorar este email.
            </p>
          </div>
        </body>
      </html>
    `,
  }
  return mail;
};

export const resetPassEmail = (email: string, url: string, name: string, from: string) => {
  // Validar que el email no sea null o undefined
  if (!email || email.trim() === '') {
    throw new Error('Email is required for reset password email');
  }

  const mail = {
    to: email.trim(),
    subject: '¡Restablecé tu contraseña!',
    from,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Restablecer Contraseña - STP</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 40px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">STP</h1>
              <p style="color: #666; margin: 10px 0;">Entrenamiento Profesional</p>
            </div>
            
            <h2 style="color: #333; text-align: center;">¡Hola ${name}!</h2>
            <p style="color: #666; text-align: center; font-size: 16px;">Solicitaste cambiar tu contraseña</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #666; margin-bottom: 20px;">Al hacer click en el siguiente botón, podrás realizar el cambio de clave:</p>
              <a href="${url}" style="background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Restablecer Contraseña
              </a>
            </div>
            
            <p style="color: #666; text-align: center; font-size: 14px;">
              Si no solicitaste este cambio, puedes ignorar este email.
            </p>
          </div>
        </body>
      </html>
    `,
  }
  return mail;
};

export const inviteStudentEmail = (
  email: string, 
  name: string, 
  companyName: string, 
  joinUrl: string, 
  from: string
) => {
  // Validar que el email no sea null o undefined
  if (!email || email.trim() === '') {
    throw new Error('Email is required for student invitation');
  }

  const mail = {
    to: email.trim(),
    subject: `¡${companyName} te invita al centro de entrenamiento!`,
    from,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Invitación al Centro - STP</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 40px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #333; margin: 0;">STP</h1>
              <p style="color: #666; margin: 10px 0;">Entrenamiento Profesional</p>
            </div>
            
            <h2 style="color: #333; text-align: center;">¡Hola ${name}!</h2>
            <h3 style="color: #555; text-align: center;">¡${companyName} te invita a formar parte de su centro de entrenamiento!</h3>
            
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center; margin: 30px 0;">
              <p style="color: #666; margin-bottom: 20px; font-size: 16px;">
                Un director de <strong>${companyName}</strong> te ha invitado a unirte como alumno/a a su centro de entrenamiento.
              </p>
              <p style="color: #666; margin-bottom: 30px;">
                ¡Hacé click en el botón para aceptar la invitación y empezar tu entrenamiento!
              </p>
              <a href="${joinUrl}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                ¡Aceptar Invitación!
              </a>
            </div>
            
            <div style="background-color: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                <strong>¿Qué significa esto?</strong><br>
                Al aceptar esta invitación podrás:
              </p>
              <ul style="color: #666; font-size: 14px; text-align: left; margin: 10px 0;">
                <li>Acceder a los planes de entrenamiento del centro</li>
                <li>Reservar clases personalizadas</li>
                <li>Recibir seguimiento personalizado</li>
                <li>Formar parte de la comunidad de ${companyName}</li>
              </ul>
            </div>
            
            <p style="color: #666; text-align: center; font-size: 14px;">
              Si no te interesa formar parte de este centro, podés ignorar este email.
            </p>
          </div>
        </body>
      </html>
    `,
  }
  return mail;
};