import {
    Injectable, NestInterceptor, ExecutionContext,
    CallHandler, Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req    = context.switchToHttp().getRequest();
        const { method, url, user } = req;
        const userId = user?.id ?? 'anonymous';
        const start  = Date.now();

        return next.handle().pipe(
            tap(() => {
                const ms  = Date.now() - start;
                const res = context.switchToHttp().getResponse();
                this.logger.log(`${method} ${url} ${res.statusCode} +${ms}ms [${userId}]`);
            }),
            catchError(err => {
                const ms = Date.now() - start;
                this.logger.error(`${method} ${url} ERROR +${ms}ms [${userId}]: ${err.message}`);
                return throwError(() => err);
            }),
        );
    }
}
