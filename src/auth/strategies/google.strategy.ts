import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    private readonly logger = new Logger(GoogleStrategy.name);

    constructor(
        config: ConfigService,
        private readonly authService: AuthService,
    ) {
        // Utilise des valeurs placeholder si les credentials Google ne sont pas configurées.
        // Google OAuth ne fonctionnera pas sans les vraies clés, mais le serveur démarrera.
        const clientID     = config.get('GOOGLE_CLIENT_ID')     ?? 'placeholder-not-configured';
        const clientSecret = config.get('GOOGLE_CLIENT_SECRET') ?? 'placeholder-not-configured';
        const callbackURL  = config.get('GOOGLE_CALLBACK_URL')  ?? 'http://localhost:3000/api/auth/google/callback';

        super({ clientID, clientSecret, callbackURL, scope: ['email', 'profile'] });

        if (clientID === 'placeholder-not-configured') {
            this.logger.warn('GOOGLE_CLIENT_ID non configurée — Google OAuth désactivé');
        }
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
        const { id, emails, name, photos } = profile;
        const result = await this.authService.loginWithGoogle(
            id,
            emails?.[0]?.value,
            name?.givenName ?? '',
            name?.familyName ?? '',
            photos?.[0]?.value,
        );
        done(null, result);
    }
}
