import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OBD2Controller } from './obd2.controller';
import { OBD2Service } from './obd2.service';
import { OBD2Session } from './entities/obd2-session.entity';

@Module({
    imports: [TypeOrmModule.forFeature([OBD2Session])],
    controllers: [OBD2Controller],
    providers: [OBD2Service],
    exports: [OBD2Service],
})
export class OBD2Module {}
