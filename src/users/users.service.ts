import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) private readonly users: Repository<User>,
    ) {}

    async findById(id: string): Promise<User> {
        const user = await this.users.findOne({ where: { id, deletedAt: IsNull() } });
        if (!user) throw new NotFoundException('Utilisateur non trouvé');
        return user;
    }

    async updateProfile(id: string, dto: Partial<Pick<User, 'firstName' | 'lastName' | 'avatarUrl' | 'locale'>>) {
        await this.users.update(id, dto);
        return this.findById(id);
    }

    async updateConsents(id: string, consents: {
        analytics?: boolean;
        dataSharing?: boolean;
        marketing?: boolean;
    }) {
        await this.users.update(id, {
            consentAnalytics:    consents.analytics,
            consentDataSharing:  consents.dataSharing,
            consentMarketing:    consents.marketing,
            consentUpdatedAt:    new Date(),
        });
    }

    async requestDeletion(id: string): Promise<void> {
        // Soft delete + programmer suppression définitive à J+30
        await this.users.softDelete(id);
        // TODO: schedule hard delete job via Bull queue
    }
}
