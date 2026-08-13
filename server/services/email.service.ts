import { emailRepository } from '../repositories/email.repository';

export class EmailService {
  async getSentEmails(companyId: string, query?: string) {
    const rows = await emailRepository.getSentEmails(companyId, query);

    return rows.map((row: any) => {
      let dataSent = null;
      if (row.data_sent) {
        try {
          dataSent = typeof row.data_sent === 'string' ? JSON.parse(row.data_sent) : row.data_sent;
        } catch (e) {}
      }
      return {
        ...row,
        data_sent: dataSent
      };
    });
  }
}

export const emailService = new EmailService();
