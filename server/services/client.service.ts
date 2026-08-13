import { clientRepository } from '../repositories/client.repository';
import { userRepository } from '../repositories/user.repository';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { auditService } from './audit.service';

export class ClientService {
  async getClients(query?: string) {
    return await clientRepository.getClients(query);
  }

  async getClientById(id: string) {
    const client = await clientRepository.findCompanyById(id);
    if (!client) {
      throw new Error('Client/Company not found');
    }
    return client;
  }

  async getClientTenant(domain: string, tenantId?: string) {
    if (tenantId && tenantId !== 'legacy-tenant-1') {
      const client = await clientRepository.findCompanyById(tenantId);
      if (client) return client;
    }
    if (domain) {
      const client = await clientRepository.findCompanyByDomain(domain);
      if (client) return client;
    }
    return null;
  }

  async createClient(body: any, req?: any) {
    const { name, domain, status, adminEmail, adminPassword, adminName } = body;
    const id = uuidv4();

    await clientRepository.createCompany({ id, name, domain, status });

    if (adminEmail && adminPassword) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(adminPassword, salt);
      const userId = uuidv4();

      await userRepository.createUser({
        id: userId,
        companyId: id,
        email: adminEmail,
        passwordHash,
        displayName: adminName || adminEmail.split('@')[0],
        role: 'Admin'
      });
    }

    if (req) {
      await auditService.createAuditLog(req, 'Created Client Tenant', { companyId: id, name, domain });
    }

    return { success: true, id };
  }

  async updateClient(id: string, body: any, req?: any) {
    const existing = await clientRepository.findCompanyById(id);
    if (!existing) {
      throw new Error('Client not found');
    }

    const { name, domain, status } = body;
    await clientRepository.updateCompany(id, { name, domain, status });

    if (req) {
      await auditService.createAuditLog(req, 'Updated Client Tenant', { companyId: id, name, domain });
    }

    return { success: true };
  }

  async resetClientPassword(id: string, body: any, req?: any) {
    const { newPassword } = body;
    if (!newPassword || newPassword.trim().length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const adminUser = await userRepository.findUserByEmailOrUsername('', id);
    if (!adminUser) {
      throw new Error('No admin user found for this tenant');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await userRepository.updateUser(adminUser.id, { passwordHash });

    if (req) {
      await auditService.createAuditLog(req, 'Reset Client Admin Password', { companyId: id });
    }

    return { success: true };
  }

  async deleteClient(id: string, req?: any) {
    const existing = await clientRepository.findCompanyById(id);
    if (!existing) {
      throw new Error('Client not found');
    }

    await clientRepository.deleteCompany(id);

    if (req) {
      await auditService.createAuditLog(req, 'Deleted Client Tenant', { companyId: id, name: existing.name });
    }

    return { success: true };
  }
}

export const clientService = new ClientService();
