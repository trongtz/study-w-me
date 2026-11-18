import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WorkspacePage } from './workspace-page';

describe('WorkspacePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspacePage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('moves the local avatar with keyboard controls and keeps it within the map', () => {
    const fixture = TestBed.createComponent(WorkspacePage);
    const page = fixture.componentInstance;

    page.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(page.playerPosition()).toEqual({ x: 52, y: 55 });

    page.playerPosition.set({ x: 92, y: 14 });
    page.handleKeydown(new KeyboardEvent('keydown', { key: 'w' }));
    expect(page.playerPosition()).toEqual({ x: 92, y: 14 });
  });

  it('toggles demo device states without requesting device access', () => {
    const fixture = TestBed.createComponent(WorkspacePage);
    const page = fixture.componentInstance;

    page.toggleMic();
    page.toggleCamera();

    expect(page.micEnabled()).toBe(true);
    expect(page.cameraEnabled()).toBe(true);
  });
});
