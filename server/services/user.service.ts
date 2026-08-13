import { userRepository } from '../repositories/user.repository';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { auditService } from './audit.service';

export class UserService {
  async getUsers(companyId: string, role: string) {
    const isLandlordOrSuperadmin = role === 'Superadmin' || (companyId === 'legacy-tenant-1' && role === 'Admin');
    return await userRepository.findUsers(companyId, isLandlordOrSuperadmin);
  }

  async createUser(companyId: string, role: string, body: any, req?: any) {
    const email = body.email;
    const password = body.password || body.temporaryPassword;
    const displayName = body.displayName;
    const userRole = body.userRole || body.role || 'Agent';
    const userId = body.userId || body.user_id;
    const targetCompanyId = body.tenantId || companyId || 'legacy-tenant-1';

    const existingUserByEmail = await userRepository.findUserByEmailOrUsername(email, targetCompanyId);
    if (existingUserByEmail) {
      throw new Error(`A user with the email address "${email}" already exists in this organization.`);
    }

    if (userId) {
      const existingUserByUsername = await userRepository.findUserByEmailOrUsername(userId, targetCompanyId);
      if (existingUserByUsername) {
        throw new Error(`The username "${userId}" is already taken within this organization.`);
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password || 'Skyway2026!', salt);
    const id = uuidv4();

    await userRepository.createUser({
      id,
      companyId: targetCompanyId,
      email,
      passwordHash,
      displayName: displayName || email.split('@')[0],
      role: userRole,
      userId: userId || null
    });

    if (req) {
      await auditService.createAuditLog(req, 'Created User', { email, role: userRole, companyId: targetCompanyId });
    }

    return { success: true, id };
  }

  async updateUser(id: string, companyId: string, body: any, req?: any) {
    const displayName = body.displayName;
    const newRole = body.role || body.userRole;
    const password = body.password || body.temporaryPassword;
    const email = body.email;
    const userId = body.userId || body.user_id;

    const existingUser = await userRepository.findUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Check for collisions if email or userId is changing
    if (email && email !== existingUser.email) {
      const collision = await userRepository.findUserByEmailOrUsername(email, companyId);
      if (collision && collision.id !== id) {
        throw new Error(`The email address "${email}" is already registered in your organization.`);
      }
    }

    if (userId && userId !== existingUser.user_id) {
      const collision = await userRepository.findUserByEmailOrUsername(userId, companyId);
      if (collision && collision.id !== id) {
        throw new Error(`The username "${userId}" is already in use within your organization.`);
      }
    }

    let passwordHash: string | undefined = undefined;
    if (password && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    await userRepository.updateUser(id, {
      displayName,
      role: newRole,
      passwordHash,
      email,
      userId: userId || null
    });

    if (req) {
      await auditService.createAuditLog(req, 'Updated User', { userId: id, displayName, role: newRole });
    }

    return { success: true };
  }

  async deleteUser(id: string, companyId: string, req?: any) {
    const existingUser = await userRepository.findUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    await userRepository.deleteUser(id);

    if (req) {
      await auditService.createAuditLog(req, 'Deleted User', { userId: id, email: existingUser.email });
    }

    return { success: true };
  }

  async checkUsername(username: string, companyId: string, excludeId?: string) {
    const existing = await userRepository.findUserByEmailOrUsername(username, companyId);
    if (existing && excludeId && existing.id === excludeId) {
      return { available: true };
    }
    return { available: !existing };
  }

  async getStats(companyId: string, role: string) {
    const isLandlordOrSuperadmin = role === 'Superadmin' || (companyId === 'legacy-tenant-1' && role === 'Admin');
    return await userRepository.getStats(companyId, isLandlordOrSuperadmin);
  }
}

export const userService = new UserService();
