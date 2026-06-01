import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type PlanLevel = 'starter' | 'plus' | 'pro' | 'fleet';

const PLAN_HIERARCHY: Record<PlanLevel, number> = {
    starter: 0,
    plus: 1,
    pro: 2,
    fleet: 3,
};

export const RequiredPlan = (plan: PlanLevel) => SetMetadata('requiredPlan', plan);

@Injectable()
export class PlanGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.get<PlanLevel>('requiredPlan', context.getHandler());
        if (!required) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) return false;

        const userLevel = PLAN_HIERARCHY[user.plan as PlanLevel] ?? 0;
        const requiredLevel = PLAN_HIERARCHY[required];

        // Vérifier expiration du plan
        if (user.planExpiresAt && new Date(user.planExpiresAt) < new Date()) {
            throw new ForbiddenException('Votre abonnement a expiré. Renouvelez votre plan pour accéder à cette fonctionnalité.');
        }

        if (userLevel < requiredLevel) {
            throw new ForbiddenException(`Cette fonctionnalité nécessite le plan "${required}" ou supérieur.`);
        }

        return true;
    }
}
