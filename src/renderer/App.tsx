import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getGrayscaleValue } from './utils';
import './App.css';

export default function Painter() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inversive, setInversive] = useState<boolean>(false);
  const [spacing, setSpacing] = useState<number>(8);
  const [alpha, setAlpha] = useState<number>(128);
  const [savePath, setSavePath] = useState<string | null>();
  const [width, setWidth] = useState<number>(window.innerWidth);
  const [height, setHeight] = useState<number>(
    window.innerHeight - window.innerHeight * 0.3,
  );
  const [scaleFactor, setScaleFactor] = useState<number>(1);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight * 0.8;
        setWidth(canvas.width);
        setHeight(canvas.height);
      }
    };

    handleResize();

    window.electron.ipcRenderer.on('start-saving', (arg) =>
      setSavePath(arg as string),
    );
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('clear-file');

    if (savePath) {
      updateCanvas(savePath);
      setSavePath(null);
    }
  }, [savePath]);

  useEffect(() => {
    updateCanvas();
  }, [imageFile, inversive, spacing, alpha, width, height]);

  const updateCanvas = (filePath?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = width;
    canvas.height = height;

    if (imageFile) {
      const img = new Image();
      img.onload = () => {
        processImage(
          context,
          img,
          width,
          height,
          inversive,
          spacing,
          alpha,
          filePath,
        );
      };
      img.src = URL.createObjectURL(imageFile);
    }
  };

  const processImage = useCallback(
    (
      context: CanvasRenderingContext2D,
      img: HTMLImageElement,
      width: number,
      height: number,
      inversive: boolean,
      spacing: number,
      alpha: number,
      filePath: string | null = null,
    ) => {
      const aspectRatio = img.width / img.height;
      let drawWidth;
      let drawHeight;

      if (aspectRatio > 1) {
        drawWidth = width;
        drawHeight = width / aspectRatio;
      } else {
        drawHeight = height;
        drawWidth = height * aspectRatio;
      }

      const offsetX = (width - drawWidth) / 2;
      const offsetY = (height - drawHeight) / 2;
      context.clearRect(0, 0, width, height);
      context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      const imageData = context.getImageData(
        offsetX,
        offsetY,
        drawWidth,
        drawHeight,
      );
      const { data } = imageData;

      context.clearRect(0, 0, width, height);
      context.fillStyle = inversive ? 'white' : 'black';

      const chunkSize = 100;
      const totalChunks = Math.ceil(drawHeight / chunkSize);

      const processChunk = (chunkIndex: number) => {
        const startY = chunkIndex * chunkSize;
        const endY = Math.min(startY + chunkSize, drawHeight);
        const positions = [];

        for (let y = startY; y < endY; y += spacing) {
          for (let x = 0; x < drawWidth; x += spacing) {
            const i = (y * drawWidth + x) * 4;
            const grayscale = getGrayscaleValue(
              alpha,
              data[i],
              data[i + 1],
              data[i + 2],
            );
            if (
              (grayscale > 240 && !inversive) ||
              (grayscale <= 240 && inversive)
            ) {
              const radius = spacing / 2;
              const randomAngle = Math.random() * Math.PI * 2;
              const randomRadius = Math.random() * radius;

              const canvasX =
                offsetX + x + randomRadius * Math.cos(randomAngle);
              const canvasY =
                offsetY + y + randomRadius * Math.sin(randomAngle);

              const scaledX = Math.round((canvasX / scaleFactor) * 100) / 100;
              const scaledY =
                Math.round(((height - canvasY) / scaleFactor) * 100) / 100;

              context.fillStyle = 'black';
              context.beginPath();
              context.arc(canvasX, canvasY, 2, 0, Math.PI * 2);
              context.fill();

              positions.push(
                `${String(scaledX.toFixed(2)).replace('.', ',')} ${String(scaledY.toFixed(2)).replace('.', ',')}`,
              );
            }
          }
        }

        if (filePath) {
          window.electron.ipcRenderer.sendMessage('save-chunk', {
            filePath,
            chunk: `${positions.join('\n')}\n`,
          });
        }

        if (chunkIndex < totalChunks - 1) {
          requestAnimationFrame(() => processChunk(chunkIndex + 1));
        }
      };

      processChunk(0);
    },
    [],
  );

  const handleSave = async () => {
    if (imageFile) {
      window.electron.ipcRenderer.sendMessage('save');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setImageFile(null);
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, width, height);
      }
    }
  };

  return (
    <div className="wrapper">
      <div
        className="canvas-wrapper"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {imageFile ? (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ border: '1px solid black' }}
          />
        ) : (
          <div className="input_container">
            <input type="file" id="uploader" onChange={handleImageUpload} />
          </div>
        )}
      </div>

      <div className="settings">
        <div className="sliders">
          <div>
            <label>Плотность {spacing}:</label>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
            />
          </div>
          <div>
            <label>A-канал {alpha}:</label>
            <input
              type="range"
              min={2}
              value={alpha}
              onChange={(e) => setAlpha(Number(e.target.value))}
            />
          </div>

          <div>
            <label>Конечный размер: {scaleFactor}</label>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={scaleFactor}
              onChange={(e) => setScaleFactor(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="buttons">
          <button onClick={() => setInversive(!inversive)}>
            Инвертировать
          </button>
          <button onClick={handleClear}>Удалить</button>
          <button onClick={handleSave}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
