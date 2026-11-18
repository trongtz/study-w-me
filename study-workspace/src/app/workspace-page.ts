import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MockSessionService } from './mock-session.service';

interface Participant {
  name: string;
  initials: string;
  status: string;
  color: string;
  x: number;
  y: number;
}

@Component({
  selector: 'app-workspace-page',
  imports: [RouterLink],
  templateUrl: './workspace-page.html',
  styleUrl: './workspace-page.css',
})
export class WorkspacePage {
  readonly session = inject(MockSessionService);
  private readonly router = inject(Router);

  readonly playerPosition = signal({ x: 49, y: 55 });
  readonly micEnabled = signal(false);
  readonly cameraEnabled = signal(false);
  readonly participants: Participant[] = [
    { name: 'Linh', initials: 'L', status: 'đang tập trung', color: 'sage', x: 20, y: 35 },
    { name: 'An', initials: 'A', status: 'đang đọc sách', color: 'rose', x: 78, y: 28 },
    { name: 'Khoa', initials: 'K', status: 'đang nghỉ một chút', color: 'blue', x: 75, y: 68 },
  ];

  toggleMic(): void {
    this.micEnabled.update((enabled) => !enabled);
  }

  toggleCamera(): void {
    this.cameraEnabled.update((enabled) => !enabled);
  }

  leaveWorkspace(): void {
    this.session.signOut();
    void this.router.navigateByUrl('/login');
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName))
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    const movements: Record<string, { x: number; y: number }> = {
      arrowup: { x: 0, y: -3 },
      w: { x: 0, y: -3 },
      arrowdown: { x: 0, y: 3 },
      s: { x: 0, y: 3 },
      arrowleft: { x: -3, y: 0 },
      a: { x: -3, y: 0 },
      arrowright: { x: 3, y: 0 },
      d: { x: 3, y: 0 },
    };
    const movement = movements[key];

    if (!movement) {
      return;
    }

    event.preventDefault();
    this.playerPosition.update((position) => ({
      x: Math.min(92, Math.max(8, position.x + movement.x)),
      y: Math.min(84, Math.max(14, position.y + movement.y)),
    }));
  }
}
