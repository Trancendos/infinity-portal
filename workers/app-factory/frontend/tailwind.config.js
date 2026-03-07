/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Discord-inspired Dark Purple Palette
        discord: {
          darker: '#1e1f22',
          dark: '#2b2d31',
          medium: '#313338',
          light: '#383a40',
          lighter: '#404249',
        },
        
        // Purple Gradient Theme
        purple: {
          950: '#1a0b2e',
          900: '#2d1b4e',
          800: '#3e2069',
          700: '#4f2683',
          600: '#603a9c',
          500: '#7c3aed',
          400: '#a855f7',
          300: '#c084fc',
          200: '#e9d5ff',
          100: '#f3e8ff',
        },
        
        // Metallic Gold Accents
        gold: {
          950: '#3d2d0f',
          900: '#6b4e1f',
          800: '#997030',
          700: '#c79140',
          600: '#e5a84d',
          500: '#f4c76d',
          400: '#f8d88c',
          300: '#fce8ab',
          200: '#fef3ca',
          100: '#fff9e5',
        },
        
        // Glassmorphic Overlays
        glass: {
          white: 'rgba(255, 255, 255, 0.1)',
          purple: 'rgba(124, 58, 237, 0.1)',
          gold: 'rgba(244, 199, 109, 0.1)',
        },
      },
      
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        
        // Discord-inspired Gradients
        'discord-purple': 'linear-gradient(135deg, #5865f2 0%, #7c3aed 100%)',
        'discord-dark': 'linear-gradient(135deg, #1e1f22 0%, #2b2d31 100%)',
        
        // Custom Purple Gradients
        'purple-dream': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'purple-blaze': 'linear-gradient(135deg, #4f2683 0%, #7c3aed 50%, #a855f7 100%)',
        'purple-night': 'linear-gradient(135deg, #1a0b2e 0%, #3e2069 100%)',
        
        // Gold Accents
        'gold-shine': 'linear-gradient(135deg, #c79140 0%, #f4c76d 50%, #e5a84d 100%)',
        'gold-metallic': 'linear-gradient(90deg, #997030 0%, #f8d88c 50%, #997030 100%)',
        
        // Combined
        'purple-gold': 'linear-gradient(135deg, #4f2683 0%, #7c3aed 50%, #e5a84d 100%)',
        'infinity': 'linear-gradient(135deg, #1a0b2e 0%, #4f2683 25%, #7c3aed 50%, #c79140 75%, #f4c76d 100%)',
      },
      
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'glass-lg': '0 8px 32px 0 rgba(31, 38, 135, 0.5)',
        'neon-purple': '0 0 20px rgba(124, 58, 237, 0.5), 0 0 40px rgba(124, 58, 237, 0.3)',
        'neon-gold': '0 0 20px rgba(244, 199, 109, 0.5), 0 0 40px rgba(244, 199, 109, 0.3)',
        'discord': '0 2px 10px 0 rgba(0, 0, 0, 0.2)',
        'discord-lg': '0 8px 16px rgba(0, 0, 0, 0.24)',
      },
      
      backdropBlur: {
        xs: '2px',
      },
      
      borderRadius: {
        'discord': '8px',
        'discord-lg': '16px',
      },
      
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
      },
      
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        glow: {
          '0%': { 
            boxShadow: '0 0 20px rgba(124, 58, 237, 0.5), 0 0 40px rgba(124, 58, 237, 0.3)',
          },
          '100%': { 
            boxShadow: '0 0 30px rgba(244, 199, 109, 0.7), 0 0 60px rgba(244, 199, 109, 0.5)',
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
