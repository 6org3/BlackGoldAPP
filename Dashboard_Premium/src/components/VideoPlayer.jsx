import React from 'react';

export default function VideoPlayer({ url }) {
  // Detectar si es un link de YouTube
  const getYoutubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const youtubeId = getYoutubeId(url);

  if (youtubeId) {
    return (
      <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-lg">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`}
          title="Video Educativo"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  // Reproductor nativo para videos propios (archivos directos)
  return (
    <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-lg bg-black">
      <video
        src={url}
        controls
        className="w-full h-full object-contain"
      >
        Tu navegador no soporta la reproducción de video.
      </video>
    </div>
  );
}
