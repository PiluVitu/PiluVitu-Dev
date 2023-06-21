const toggleButton = document.querySelector('#toggleThemeMode')
const profilePhoto = document.querySelector('#profilePhoto')
const webPage = document.querySelector('html')
const projectCard = document.querySelector('.card .toggleDes')
const svgFiles = {
  eletro: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 314.09 314.09"><defs><style>.cls-1{fill:#af8ec1;}.cls-2{fill:none;}</style></defs><g id="Livello_2" data-name="Livello 2"><g id="Livello_10" data-name="Livello 10"><path class="cls-1" d="M270,217.38l0,0a127.47,127.47,0,0,1-160.49,57.53c.77.05,43.6,2.93,57.78-7.87,0,0-69.5-8.18-68.47-83.46,0,0,8.51,14.64,23.84,14.64s25.89-18.39,25.89-36.45-21.46-41.22-45.65-41.22S38.61,141.08,47.78,221.07A127.39,127.39,0,0,1,80.21,56.12C79.26,57.54,55.83,92.51,58,110c0,0,42-56,106.57-17.28,0,0-17,0-24.65,13.26s2.9,31.62,18.51,40.69,46.43,2.15,58.58-18.76S231.57,62,157.81,29.71h.05A127.36,127.36,0,0,1,283.55,136.58c-.62-1.17-20.39-38.71-36.9-45.1.42.93,28.88,63.79-35.34,102,0,0,8-14.92,0-28s-29.22-12.45-44.61-3-23.9,39.85-11.26,60.47S206.61,267,270,217.38Z"/><rect class="cls-2" width="314.09" height="314.09"/></g></g></svg>`,
  pyro: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 314.09 314.09"><defs><style>.cls-1{fill:#ef7938;}.cls-2{fill:none;}</style></defs><g id="Livello_2" data-name="Livello 2"><g id="Livello_10" data-name="Livello 10"><path class="cls-1" d="M154.81,18.06s0,22.28-13,38.9-23.94,26.6-23.94,43.89,12.64,30.92,46.55,44.89S216,180.32,216,199.6s-13.62,45.93-58.71,45.55c-44.53-7-22.75-44.88-10.79-48.87,0,0-34.54-2.95-34.54,21.66s32.55,32.53,51.67,32.53,77.64-11.3,77.64-61.17c0-19.58-7.65-30.59-7.65-30.59s29,11.17,25.6,39.56c-4.33,35.86-56.18,38.36-99.81,79.84,0,0-11.62-13.58-51.47-33.29-22.82-11.28-50.32-20.93-49.55-54.5.64-27.92,30.26-39.26,30.26-39.26s-49.87,51.2,21.61,85.12c0,0-46.21-71.82,44.89-87.45,0,0-49.54-12.63-51.54-55.19,0,0-8.31,23.94-20.28,36.57S41.51,172.48,45.5,206.06s82.38,52.39,113.63,90c0,0,25.27-26.27,50.87-38.57s111.05-51.87,13-126.68c0,0-15-10-16.29-37.58a50.17,50.17,0,0,0-13.3,33.59c0,20.61,14.67,17,16.29,36.21,0,0-28.93-24.58-28.6-43.86s7.65-39.9,7.65-39.9-50.2,22.94-25.27,59.18c0,0-18.29-7.31-14.3-31.92S207.34,81.23,154.81,18.06Z"/><path class="cls-1" d="M169.94,227s27.43-8.56,27.43-30-40.72-59.34-74.07-10c0,0,31.67-15.46,45.64,5S169.94,227,169.94,227Z"/><rect class="cls-2" width="314.09" height="314.09"/></g></g></svg>`
}

toggleButton.addEventListener('click', () => {
  webPage.classList.toggle('light')
  const hasLight = webPage.classList.contains('light')
  hasLight
    ? (profilePhoto.src = './public/BestProfileIcon.webp')
    : (profilePhoto.src = './public/BestProfileIcon2.webp')

  hasLight ? (toggleButton.innerHTML = svgFiles.pyro) : (toggleButton.innerHTML = svgFiles.eletro)
})

showOrHideCardContent('projectOne')
showOrHideCardContent('projectTwo')
showOrHideCardContent('projectThree')
showOrHideCardContent('projectFour')

function showOrHideCardContent(cardName) {
  const card = document.querySelector(`.${cardName}`)
  card.addEventListener('click', () => {
    card.classList.toggle('show')
  })
  card.addEventListener('keydown', event => {
    const keyName = event.key
    if (keyName == 'Enter') {
      card.classList.toggle('show')
    }
  })
}
