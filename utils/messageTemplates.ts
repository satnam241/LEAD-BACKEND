// utils/messageTemplates.ts

export const getDefaultMessage = (leadName?: string) => {
    return `
  Hi ${leadName || "there"}, 👋
  
  Thank you for showing interest in our services.
  
  We’ve successfully received your request, and one of our specialists will connect with you shortly to assist you with the next steps.
  
  In the meantime, if you have any questions or specific requirements, feel free to reply to this message — we’re here to help.
  
  We appreciate your time and look forward to assisting you.
  
  Warm regards,  
 
  🚀 Your Trusted Partner
    `;
  };