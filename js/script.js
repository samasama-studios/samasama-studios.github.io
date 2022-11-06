
/////////////////////
// Configure Vue here
const VueApp = {
    components: {

    },
    
    data() {
        return {
            isMenuOpen: false,
            currentGalleryIndex: 0,
            currentGalleryItem: '',
            gallery: [
                {
                    image: '/assets/gallery/0.jpg',
                    client: 'GJ & The Evocations',
                    event: 'live concert'
                },
                {
                    image: '/assets/gallery/1.jpg',
                    client: 'Comedy Estonia',
                    event: 'live show'
                },
                {
                    image: '/assets/gallery/2.jpg',
                    client: 'The Crosslegs',
                    event: 'album recording'
                },
                {
                    image: '/assets/gallery/4.jpg',
                    client: 'M. Tärn & E. Pärnoja',
                    event: 'live performance'
                }
            ],
            currentProjectIndex: 0,
            currentProject: {
                image: '',
                title: '',
                subtitle: '',
                body: '',
                buttonLabel: '',
                color: '',
                url: ''
            },
            projects: [
                {                    
                    image: '/assets/portfolio/codesters.jpg',
                    title: 'codesters.club',
                    subtitle: 'Product & Mentoring',
                    body: 'An initiative to mentor high school students to build digital products, started and supported by the Riesenkampff Foundation.\n\nStudents are ideating, desgining and prototyping their own ideas and we guide them through the process.',
                    buttonLabel: 'Join the club',
                    color: '#7ACB76',
                    url: 'https://codesters.club'
                },
                {                    
                    image: '/assets/portfolio/algoparticular.jpg',
                    title: 'algo.particular',
                    subtitle: 'Illustration & purpose',
                    body: 'A minimalistic comic that reflects philosophical and spiritual situations & concepts from our daily lives.\n\nIt shares a perspective from an old truth: we are all the same, we are all one and we are (not from) here.',
                    buttonLabel: 'Navigate the universe',
                    color: '#FF6F61',
                    url: 'https://algoparticular.com'
                },
                {                    
                    image: '/assets/portfolio/tipid.jpg',
                    title: 'Tipid',
                    subtitle: 'Support & Guidance',
                    body: 'Long-legged cuddly dolls made of 100% recycled materials & filled with wool.\n\nWe’re developing an interactive webshop to create, customize, request and give life to your own TIPI doll.',
                    buttonLabel: 'Create your own',
                    color: '#76C7E0',
                    url: 'https://tipid.ee'
                },
                {                    
                    image: '/assets/portfolio/koidumaja.jpg',
                    title: 'Koidumaja',
                    subtitle: 'Art & Community',
                    body: 'An artistic center, theater & art residencies provider, in Viljandi ― the heart of the cultural movement in Estonia.\n\nSama Sama as part of the cooperative, organise events, assists the residencies & gives support with digital developments.',
                    buttonLabel: 'Check what’s happening',
                    color: '#F3B420',
                    url: 'https://www.koidumaja.ee/gallery'
                }
            ],
        }
    },    
  
    // Functions go here
    methods: {        
        underlineAnim(event) {
            let underline = event.target.querySelector(".underline");
    
            anime({
                targets: underline,
                width: "100%",
                left: "0%",
                easing: 'easeOutQuint'
            });
        },
        leaveUnderlineAnim(event) {
            let underline = event.target.querySelector(".underline");
    
            anime({
                targets: underline,
                width: "0%",
                left: "0%",
                easing: 'easeInQuint'
            });
        },
        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
        },        
        showGallery(n) {
            this.currentGalleryIndex += n;

            if (this.currentGalleryIndex > this.gallery.length-1) {this.currentGalleryIndex = 0}
            if (this.currentGalleryIndex < 0) {this.currentGalleryIndex = this.gallery.length-1}
            
            this.currentGalleryItem = this.gallery[this.currentGalleryIndex];            
        },
        showProject(n) {
            this.currentProjectIndex += n;

            if (this.currentProjectIndex > this.projects.length-1) {this.currentProjectIndex = 0}
            if (this.currentProjectIndex < 0) {this.currentProjectIndex = this.projects.length-1}
            
            this.currentProject = this.projects[this.currentProjectIndex];            
        }
    },

    // Code that will run as soon as app is ready
    mounted() {
        this.showProject(0); 
        this.showGallery(0); 
    }
};
/////////////////////  


// Initialize Vue
Vue.createApp(VueApp).mount('#app');
  