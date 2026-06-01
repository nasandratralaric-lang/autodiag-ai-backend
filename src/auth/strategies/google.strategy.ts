import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        config: ConfigService,
        private readonly authService: AuthService,
    ) {
        super({
            clientID: config.get('GOOGLE_CLIENT_ID'),
            clientSecret: config.get('GOOGLE_CLIENT_SECRET'),
            callbackURL: config.get('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
        });
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
        const { id, emails, name, photos } = profile;
        const email = emails?.[0]?.value;
        const firstName = name?.givenName ?? '';
        const lastName = name?.familyName ?? '';
        const avatarUrl = photos?.[0]?.value;

        const result = await this.authService.loginWithGoogle(id, email, firstName, lastName, avatarUrl);
        done(null, result);
    }
}
