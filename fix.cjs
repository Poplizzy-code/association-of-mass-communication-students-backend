// const fs = require('fs')
// let lines = fs.readFileSync('models/User.model.js', 'utf8').split('\n')
// lines[14] = '   lastSeen: { type: Date, default: Date.now },'
// lines[25] = '  return await bcrypt.compare(candidatePassword, this.password);'
// fs.writeFileSync('models/User.model.js', lines.join('\n'))
// console.log('Done!')

const fs = require('fs')
const lines = fs.readFileSync('models/User.model.js', 'utf8').split('\n')
console.log(lines[14])
console.log(lines[25])

// const fs = require('fs')    
// const lines = fs.readFileSync('models/User.model.js', 'utf8').split('\n')
// lines.forEach((line, i) => {
//     console.log(i, line)
// })  