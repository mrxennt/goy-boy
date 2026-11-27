import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound } from './lib/canvas';

const W = 800;
const H = 520;
const MAX_WAVES = 10;

type Vec = { x: number; y: number };
type TowerType = 'gun' | 'cannon' | 'frost';
type Enemy = { x: number; y: number; hp: number; maxHp: number; speed: number; wp: number; slow: number; reward: number };
type Tower = { slot: number; type: TowerType; level: number; cooldown: number; angle: number };
type Shot = { x: number; y: number; target: Enemy | null; tx: number; ty: number; damage: number; splash: number; slow: boolean; color: string };

const PATH: Vec[] = [
  { x: -30, y: 110 }, { x: 165, y: 110 }, { x: 165, y: 330 }, { x: 375, y: 330 },
  { x: 375, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 415 }, { x: 830, y: 415 },
];

const SLOTS: Vec[] = [
  { x: 85, y: 210 }, { x: 250, y: 205 }, { x: 90, y: 435 }, { x: 275, y: 435 }, { x: 300, y: 250 },
  { x: 480, y: 240 }, { x: 520, y: 70 }, { x: 690, y: 245 }, { x: 690, y: 490 }, { x: 285, y: 55 },
];

const TOWERS: Record<TowerType, { name: string; cost: number; range: number; damage: number; cooldown: number; color: string; splash: number; slow: boolean; note: string }> = {
  gun: { name: 'Blaster', cost: 50, range: 132, damage: 15, cooldown: 420, color: '#22d3ee', splash: 0, slow: false, note: 'Schnell, einzeln' },
  cannon: { name: 'Kanone', cost: 90, range: 152, damage: 40, cooldown: 1150, color: '#fb923c', splash: 46, slow: false, note: 'Flächenschaden' },
  frost: { name: 'Frost', cost: 70, range: 122, damage: 10, cooldown: 720, color: '#60a5fa', splash: 0, slow: true, note: 'Verlangsamt' },
};

type GameData = {
  gold: number;
  lives: number;
  wave: number;
  active: boolean;
  enemies: Enemy[];
  towers: Tower[];
  shots: Shot[];
  spawnLeft: number;
  spawnTimer: number;
  selected: TowerType;
  message: string;
  over: boolean;
};

const freshGame = (): GameData => ({
  gold: 160,
  lives: 12,
  wave: 0,
  active: false,
  enemies: [],
  towers: [],
  shots: [],
  spawnLeft: 0,
  spawnTimer: 0,
  selected: 'gun',
  message: 'Baue Türme auf die Slots und starte die erste Welle.',
  over: false,
});

export default function TowerDefense({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const data = useRef<GameData>(freshGame());
  const [ui, setUi] = useState({ gold: 160, lives: 12, wave: 0, active: false, selected: 'gun' as TowerType, message: '' });
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const sync = () => {
    setUi({
      gold: data.current.gold,
      lives: data.current.lives,
      wave: data.current.wave,
      active: data.current.active,
      selected: data.current.selected,
      message: data.current.message,
    });
  };

  function reset() {
    data.current = freshGame();
    sync();
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function startWave() {
    const g = data.current;
    if (g.active || g.over || session.status !== 'playing') return;
    if (g.wave >= MAX_WAVES) return;
    g.wave += 1;
    g.active = true;
    g.spawnLeft = 4 + g.wave * 2;
    g.spawnTimer = 200;
    g.message = `Welle ${g.wave} läuft – halte die Basis!`;
    sfx.start();
    sync();
  }

  function placeTower(slotIndex: number) {
    const g = data.current;
    if (g.over || session.status !== 'playing') return;
    const existing = g.towers.find((tower) => tower.slot === slotIndex);
    if (existing) {
      if (existing.level >= 3) {
        g.message = 'Dieser Turm ist bereits maximal ausgebaut.';
        sfx.error();
        sync();
        return;
      }
      const price = Math.round(TOWERS[existing.type].cost * 0.9 * existing.level);
      if (g.gold < price) {
        g.message = `Für das Upgrade fehlen ${price - g.gold} Gold.`;
        sfx.error();
        sync();
        return;
      }
      g.gold -= price;
      existing.level += 1;
      g.message = `${TOWERS[existing.type].name} auf Stufe ${existing.level} verbessert.`;
      sfx.win();
      sync();
      return;
    }
    const spec = TOWERS[g.selected];
    if (g.gold < spec.cost) {
      g.message = `Nicht genug Gold für ${spec.name} (${spec.cost}).`;
      sfx.error();
      sync();
      return;
    }
    g.gold -= spec.cost;
    g.towers.push({ slot: slotIndex, type: g.selected, level: 1, cooldown: 0, angle: 0 });
    g.message = `${spec.name} gebaut – ${spec.note}.`;
    sfx.pick();
    sync();
  }

  function spawnEnemy() {
    const g = data.current;
    const hp = 48 + g.wave * 34;
    g.enemies.push({
      x: PATH[0].x,
      y: PATH[0].y,
      hp,
      maxHp: hp,
      speed: 52 + g.wave * 3.6,
      wp: 1,
      slow: 0,
      reward: 8 + Math.round(g.wave * 1.6),
    });
  }

  function update(dtMs: number) {
    const g = data.current;
    if (g.over) return;
    const dt = Math.min(46, dtMs) / 1000;

    if (g.active && g.spawnLeft > 0) {
      g.spawnTimer -= dtMs;
      if (g.spawnTimer <= 0) {
        spawnEnemy();
        g.spawnLeft -= 1;
        g.spawnTimer = Math.max(210, 640 - g.wave * 26);
      }
    }

    for (const enemy of g.enemies) {
      if (enemy.slow > 0) enemy.slow = Math.max(0, enemy.slow - dtMs);
      const target = PATH[enemy.wp];
      if (!target) continue;
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const speed = enemy.speed * (enemy.slow > 0 ? 0.42 : 1);
      if (distance < 4) {
        enemy.wp += 1;
        if (enemy.wp >= PATH.length) {
          enemy.hp = -1;
          g.lives -= 1;
          sfx.hit();
          if (g.lives <= 0) {
            g.over = true;
            g.message = 'Die Basis ist gefallen.';
            sync();
            finishRef.current(0, 'Basis zerstört');
            return;
          }
        }
      } else {
        enemy.x += (dx / distance) * speed * dt;
        enemy.y += (dy / distance) * speed * dt;
      }
    }
    g.enemies = g.enemies.filter((enemy) => enemy.hp > 0);

    for (const tower of g.towers) {
      const spec = TOWERS[tower.type];
      tower.cooldown -= dtMs;
      const slot = SLOTS[tower.slot];
      let best: Enemy | null = null;
      let bestProgress = -Infinity;
      for (const enemy of g.enemies) {
        if (Math.hypot(enemy.x - slot.x, enemy.y - slot.y) > spec.range + tower.level * 8) continue;
        const nextPoint = PATH[enemy.wp] ?? PATH[PATH.length - 1];
        const progress = enemy.wp * 1000 - Math.hypot(nextPoint.x - enemy.x, nextPoint.y - enemy.y);
        if (progress > bestProgress) {
          bestProgress = progress;
          best = enemy;
        }
      }
      if (best) {
        tower.angle = Math.atan2(best.y - slot.y, best.x - slot.x);
        if (tower.cooldown <= 0) {
          tower.cooldown = spec.cooldown * (1 - (tower.level - 1) * 0.12);
          g.shots.push({
            x: slot.x,
            y: slot.y,
            target: best,
            tx: best.x,
            ty: best.y,
            damage: spec.damage * (1 + (tower.level - 1) * 0.55),
            splash: spec.splash + (tower.level - 1) * 6,
            slow: spec.slow,
            color: spec.color,
          });
          sfx.click();
        }
      }
    }

    g.shots = g.shots.filter((shot) => {
      const target = shot.target;
      if (target && target.hp > 0) {
        shot.tx = target.x;
        shot.ty = target.y;
      }
      const dx = shot.tx - shot.x;
      const dy = shot.ty - shot.y;
      const distance = Math.hypot(dx, dy);
      const step = 560 * dt;
      if (distance <= step + 6) {
        if (target && target.hp > 0) {
          if (shot.splash > 0) {
            for (const enemy of g.enemies) {
              if (Math.hypot(enemy.x - shot.tx, enemy.y - shot.ty) <= shot.splash) {
                enemy.hp -= shot.damage;
                if (shot.slow) enemy.slow = 1600;
              }
            }
          } else {
            target.hp -= shot.damage;
            if (shot.slow) target.slow = 1600;
          }
          if (target.hp <= 0) {
            g.gold += target.reward;
            sfx.point();
          }
        }
        return false;
      }
      shot.x += (dx / distance) * step;
      shot.y += (dy / distance) * step;
      return true;
    });

    g.enemies = g.enemies.filter((enemy) => {
      if (enemy.hp <= 0 && enemy.hp !== -1) return false;
      return true;
    });

    if (g.active && g.spawnLeft === 0 && g.enemies.length === 0) {
      g.active = false;
      g.gold += 45;
      if (g.wave >= MAX_WAVES) {
        g.over = true;
        g.message = 'Alle Wellen überstanden!';
        sync();
        finishRef.current(0, 'Alle 10 Wellen überlebt!');
        return;
      }
      g.message = `Welle ${g.wave} geschafft! +45 Gold. Nächste Welle bereit.`;
      sync();
      sfx.win();
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const g = data.current;
    drawBackdrop(ctx, W, H, 'rgba(30, 64, 175, 0.28)');

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // path
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c1f36';
    ctx.lineWidth = 52;
    ctx.beginPath();
    PATH.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();
    ctx.strokeStyle = '#262a46';
    ctx.lineWidth = 42;
    ctx.stroke();
    ctx.setLineDash([12, 14]);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // base
    ctx.save();
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = 22;
    fillRound(ctx, W - 62, H - 152, 46, 46, 12, '#be185d');
    ctx.restore();
    drawText(ctx, '🏠', W - 39, H - 129, 22, '#fff', 'center');

    // slots
    SLOTS.forEach((slot, index) => {
      const tower = g.towers.find((entry) => entry.slot === index);
      if (!tower) {
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 21, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawText(ctx, '+', slot.x, slot.y, 18, 'rgba(196,181,253,0.7)', 'center', '600');
        return;
      }
      const spec = TOWERS[tower.type];
      ctx.save();
      ctx.shadowColor = spec.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(10, 11, 18, 0.95)';
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.translate(slot.x, slot.y);
      ctx.rotate(tower.angle);
      fillRound(ctx, 0, -5, 20, 10, 4, spec.color);
      ctx.restore();
      for (let level = 0; level < tower.level; level += 1) {
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(slot.x - 8 + level * 8, slot.y + 26, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // enemies
    for (const enemy of g.enemies) {
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.save();
      ctx.shadowColor = enemy.slow > 0 ? '#93c5fd' : '#f87171';
      ctx.shadowBlur = 14;
      ctx.fillStyle = enemy.slow > 0 ? '#60a5fa' : ratio > 0.5 ? '#f87171' : '#fb923c';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(enemy.x - 14, enemy.y - 22, 28, 4);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(enemy.x - 14, enemy.y - 22, 28 * ratio, 4);
    }

    for (const shot of g.shots) {
      ctx.save();
      ctx.shadowColor = shot.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.splash > 0 ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawText(ctx, `❤ ${g.lives}`, 18, 24, 14, '#fda4af', 'left', '800');
    drawText(ctx, `🪙 ${g.gold}`, 96, 24, 14, '#fde68a', 'left', '800');
    drawText(ctx, `Welle ${g.wave}/${MAX_WAVES}`, W - 18, 24, 13, '#c7d2fe', 'right', '700');
  }

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  const handleClick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    let closest = -1;
    let bestDistance = 30;
    SLOTS.forEach((slot, index) => {
      const distance = Math.hypot(slot.x - x, slot.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = index;
      }
    });
    if (closest >= 0) placeTower(closest);
  };

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">🪙 <b>{ui.gold}</b></span>
          <span className="gstatus">❤ <b>{ui.lives}</b></span>
          <span className="gstatus">Welle <b>{ui.wave}</b>/{MAX_WAVES}</span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {(Object.keys(TOWERS) as TowerType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`gbtn ${ui.selected === type ? 'is-active' : ''}`}
              onClick={() => {
                data.current.selected = type;
                data.current.message = `${TOWERS[type].name}: ${TOWERS[type].note} · ${TOWERS[type].cost} Gold`;
                sfx.click();
                sync();
              }}
            >
              {TOWERS[type].name} · {TOWERS[type].cost}
            </button>
          ))}
          <button type="button" className="gbtn primary" onClick={startWave} disabled={ui.active || ui.wave >= MAX_WAVES}>
            {ui.active ? `Welle ${ui.wave} läuft` : `Welle ${Math.min(ui.wave + 1, MAX_WAVES)} starten`}
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="game-canvas"
          style={{ maxWidth: W }}
          onPointerDown={(event) => handleClick(event.clientX, event.clientY)}
        />
        <p className="game-hint">{ui.message || 'Turm wählen, Slot anklicken. Nochmal klicken baut aus.'}</p>
      </div>
    </GameStage>
  );
}
