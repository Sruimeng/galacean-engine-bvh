/**
 * Demo Center - 首页交互效果
 */

// 添加简单的交互效果
document.addEventListener('DOMContentLoaded', function () {
  const cards = document.querySelectorAll('.demo-card');

  cards.forEach((card, index) => {
    const element = card as HTMLElement;
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

    setTimeout(() => {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    }, 100 + index * 100);
  });
});