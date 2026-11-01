import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../../../shared/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Thiếu mã truy cập (Bearer Token hoặc Access Cookie).');
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new UnauthorizedException('Chưa cấu hình xác thực.');
      const payload = this.jwtService.verify(token, { secret, algorithms: ['HS256'] });
      if (payload.tokenType !== 'access' || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
        throw new UnauthorizedException('Token không hợp lệ.');
      }
      const user = await this.authService.getProfile(payload.sub);
      request.user = { id: user.id, email: user.email, role: user.role, fullName: user.fullName };

      return true;
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      throw new UnauthorizedException('Mã truy cập không hợp lệ hoặc đã hết hạn.');
    }
  }

  private extractTokenFromRequest(request: any): string | undefined {
    const authHeader = request.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Also check cookies if parsed
    if (request.cookies && request.cookies.access_token) {
      return request.cookies.access_token;
    }

    return undefined;
  }
}

