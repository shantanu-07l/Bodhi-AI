class Demo {
    static int staticVar = 100; // Static variable

    public static void main(String[] args) {
        // Access without creating object
        // System.out.println(Demo.staticVar); // Recommended
        System.out.println(staticVar);      // Works inside same class
    }
}
