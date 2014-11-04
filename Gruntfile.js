module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    coffee: {
        default: {
          expand: true,
          cwd: 'src',
          src: ['**/*.coffee'],
          dest: 'lib',
          ext: '.js'
        }
    },
    shell: {
      default: {
        command: 'make;',
        options: {
          stdout: true,
          stderr: true
        }
      }
    },
    watch: {
      default: {
        files: ['src/**/*.coffee'],
        tasks: ['coffee', 'shell'],
        options: {
          nospawn: true
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-shell');

  grunt.registerTask('default', ['coffee', 'shell']);

};